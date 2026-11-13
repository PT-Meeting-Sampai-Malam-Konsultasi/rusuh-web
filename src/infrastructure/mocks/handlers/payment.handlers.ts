import { http, HttpResponse, type HttpHandler } from 'msw';

import type { Booking, Ticket } from '@core/entities/booking/booking.entity';
import type {
  PaymentStatus,
  PaymentStatusResponse,
  PaymentView,
  SnapTransaction,
} from '@core/entities/payment/payment.entity';

import { bookingsFixture } from '../fixtures/bookings.fixture';
import { eventsFixture } from '../fixtures/events.fixture';
import { expireIfDue, type MockSnapAttempt, type StoredBooking } from './mock-booking-store';
import { failure, problem, type MockHandlerContext } from './shared';

/** An attempt settles this long after its first status poll (the "verifying" step of the page). */
export const MOCK_SETTLE_MS = 3000;
/** The account of the mocked sign-in; where a refund notice would go (ADR-0009). */
export const MOCK_CUSTOMER_EMAIL = 'nadia.saputri@example.com';
const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
/** Attempt statuses after which Snap cannot be paid again with that token. */
const FINAL_STATUSES: ReadonlySet<PaymentStatus> = new Set(['denied', 'failed', 'cancelled', 'expired']);

const signedOut = () => problem(401, 'UNAUTHORIZED', 'Sesi berakhir');
const bookingNotFound = () => problem(404, 'NOT_FOUND', 'Pesanan tidak ditemukan');
const notHeld = () => problem(409, 'BOOKING_NOT_HELD', 'Pesanan tidak lagi aktif');
const hasSession = (request: Request) => request.headers.get('Authorization')?.startsWith('Bearer ') === true;

const toSnapTransaction = (booking: Booking, attempt: MockSnapAttempt): SnapTransaction => ({
  attemptId: attempt.attemptId,
  orderId: `${booking.bookingId}-${attempt.attemptId}`,
  method: null,
  snapToken: attempt.snapToken,
  redirectUrl: `https://app.sandbox.midtrans.com/snap/v4/redirection/${attempt.snapToken}`,
  // A PAYMENT_PENDING booking always has its deadline.
  gatewayExpiresAt: booking.expiresAt!,
});

/** One e-ticket per attendee, as the webhook mints them in the same transaction as PAID. */
const mintTickets = (booking: Booking, issuedAt: string): Ticket[] => {
  const digits = (booking.orderCode ?? '').replace(/\D/g, '').slice(-6);
  return (booking.attendees ?? []).map((attendee, index) => {
    const ticketCode = `MCK-${digits}-${index + 1}`;
    return {
      ticketId: `${booking.bookingId}_t${index + 1}`,
      ticketCode,
      bookingId: booking.bookingId,
      eventId: booking.eventId,
      categoryId: attendee.categoryId,
      categoryName: attendee.categoryName,
      holderName: attendee.fullName,
      nikMasked: attendee.nikMasked,
      qrPayload: `RSH1.${ticketCode}.bW9jay1zaWduZWQ`,
      issuedAt,
    };
  });
};

/**
 * FR-20-W1: the payment module (`/payment/payments/…`, ADR-0028) on the core host. Reads the bookings the booking mock
 * stored (FR-16 payment entry), keeps their Snap attempts, and settles them on status polls. First match wins.
 */
export function paymentHandlers({ coreApiUrl, getScenario, now, bookingStore }: MockHandlerContext): HttpHandler[] {
  /** startSnapPayment calls per booking (snap_busy fails only the first). */
  const snapStarts = new Map<string, number>();
  const base = `${coreApiUrl}/payment/payments/:bookingId`;

  type Lookup = { stored: StoredBooking; fixture?: undefined } | { stored?: undefined; fixture: Booking };

  /** The shared first rows: failure scenarios, 401 without a bearer, 404 for an unknown booking. */
  const lookUp = async (request: Request, bookingId: string): Promise<Response | Lookup> => {
    const failed = await failure(getScenario());
    if (failed) return failed;
    if (!hasSession(request)) return signedOut();
    const stored = bookingStore.get(bookingId);
    if (stored) {
      expireIfDue(stored, now());
      return { stored };
    }
    const fixture = bookingsFixture(now()).find((b) => b.bookingId === bookingId);
    return fixture ? { fixture } : bookingNotFound();
  };

  return [
    http.get(base, async ({ request, params }) => {
      const found = await lookUp(request, String(params.bookingId));
      if (found instanceof Response) return found;
      const { stored } = found;
      if (!stored || stored.booking.status !== 'PAYMENT_PENDING') return notHeld();
      const today = now();
      const { booking } = stored;
      const event = eventsFixture(today).find((e) => e.eventId === booking.eventId);
      const live = [...stored.attempts].reverse().find((a) => !FINAL_STATUSES.has(a.status));
      return HttpResponse.json<PaymentView>({
        bookingId: booking.bookingId,
        orderCode: booking.orderCode ?? '',
        eventName: event?.name,
        eventStartsAt: event?.startsAt,
        venueShort: event?.venueShort,
        timezone: event?.timezone,
        attendees: booking.attendees ?? [],
        customerEmail: MOCK_CUSTOMER_EMAIL,
        price: booking.price,
        // snap_busy: no live attempt, so the first "Bayar" calls startSnap and meets the 503.
        currentSnap: live && getScenario() !== 'snap_busy' ? toSnapTransaction(booking, live) : null,
        expiresAt: booking.expiresAt!,
        serverNow: today.toISOString(),
        csrfToken: 'mock-csrf',
        snapClientKey: 'SB-Mid-client-mock',
      });
    }),
    http.post(`${base}/snap`, async ({ request, params }) => {
      const bookingId = String(params.bookingId);
      const found = await lookUp(request, bookingId);
      if (found instanceof Response) return found;
      const key = request.headers.get(IDEMPOTENCY_KEY_HEADER);
      if (!key) return problem(422, 'VALIDATION_FAILED', 'Data tidak lengkap');
      const { stored } = found;
      if (!stored || stored.booking.status !== 'PAYMENT_PENDING') return notHeld();
      const { booking, attempts } = stored;
      const replay = attempts.find((a) => a.idempotencyKey === key);
      if (replay) return HttpResponse.json<SnapTransaction>(toSnapTransaction(booking, replay), { status: 201 });
      const starts = (snapStarts.get(bookingId) ?? 0) + 1;
      snapStarts.set(bookingId, starts);
      if (getScenario() === 'snap_busy' && starts === 1) {
        return problem(503, 'PAYMENT_PROVIDER_BUSY', 'Layanan pembayaran sedang sibuk');
      }
      const attemptId = attempts.length + 1;
      const attempt: MockSnapAttempt = {
        attemptId,
        idempotencyKey: key,
        snapToken: `mock-snap-${bookingId}-${attemptId}`,
        status: 'none',
        firstPolledAt: null,
      };
      attempts.push(attempt);
      bookingStore.save(stored);
      return HttpResponse.json<SnapTransaction>(toSnapTransaction(booking, attempt), { status: 201 });
    }),
    http.get(`${base}/status`, async ({ request, params }) => {
      const found = await lookUp(request, String(params.bookingId));
      if (found instanceof Response) return found;
      const today = now();
      const serverNow = today.toISOString();
      const answer = (bookingStatus: Booking['status'], paymentStatus: PaymentStatus) =>
        HttpResponse.json<PaymentStatusResponse>({ bookingStatus, paymentStatus, serverNow });
      if (found.fixture) {
        return answer(found.fixture.status, found.fixture.status === 'PAID' ? 'settled' : 'expired');
      }
      const { stored } = found;
      const last = stored.attempts.at(-1);
      if (stored.booking.status !== 'PAYMENT_PENDING') return answer(stored.booking.status, last?.status ?? 'none');
      if (!last || FINAL_STATUSES.has(last.status)) return answer('PAYMENT_PENDING', last?.status ?? 'none');
      if (last.firstPolledAt === null) {
        last.firstPolledAt = today.getTime();
        last.status = 'pending';
        return answer('PAYMENT_PENDING', 'pending');
      }
      const scenario = getScenario();
      if (scenario === 'payment_pending' || today.getTime() - last.firstPolledAt < MOCK_SETTLE_MS) {
        last.status = 'pending';
        return answer('PAYMENT_PENDING', 'pending');
      }
      if (scenario === 'payment_denied' && last.attemptId === 1) {
        last.status = 'denied';
        return answer('PAYMENT_PENDING', 'denied');
      }
      if (scenario === 'payment_late') {
        // ADR-0009: the money arrived after the hold ended: no ticket, flagged for refund.
        last.status = 'paid_after_expiry';
        stored.booking = { ...stored.booking, status: 'EXPIRED', expiresAt: null, refundRequired: true };
        bookingStore.save(stored);
        return answer('EXPIRED', 'paid_after_expiry');
      }
      last.status = 'settled';
      stored.booking = {
        ...stored.booking,
        status: 'PAID',
        paidAt: serverNow,
        paymentMethod: 'qris',
        expiresAt: null,
        tickets: mintTickets(stored.booking, serverNow),
      };
      bookingStore.save(stored);
      return answer('PAID', 'settled');
    }),
  ];
}
