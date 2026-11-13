import { http, HttpResponse, type HttpHandler } from 'msw';

import type { Booking, Ticket } from '@core/entities/booking/booking.entity';
import type { PaymentStatus } from '@core/entities/payment/payment.entity';

import { bookingsFixture } from '../fixtures/bookings.fixture';
import { expireIfDue } from './mock-booking-store';
import { failure, problem, type MockHandlerContext } from './shared';

/** An attempt settles this long after its first status check (the "verifying" step of the page). */
export const MOCK_SETTLE_MS = 3000;
/** Attempt statuses after which Snap cannot be paid again with that token. */
export const FINAL_STATUSES: ReadonlySet<PaymentStatus> = new Set(['denied', 'failed', 'cancelled', 'expired']);

const signedOut = () => problem(401, 'UNAUTHORIZED', 'Sesi berakhir');
const bookingNotFound = () => problem(404, 'NOT_FOUND', 'Pesanan tidak ditemukan');
const admissionInvalid = () => problem(403, 'ADMISSION_INVALID', 'Akses pemesanan sudah tidak berlaku');
const hasSession = (request: Request) => request.headers.get('Authorization')?.startsWith('Bearer ') === true;

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
 * FR-20-W1: `POST /core/bookings/{bookingId}/check-status` (core.booking, Apidog): re-checks the live Snap attempt and
 * answers the booking. Settles the attempt the enter-payment mock opened: pending on the first check, then (after
 * MOCK_SETTLE_MS) PAID with tickets, or the scenario's denied / late outcome.
 */
export function paymentHandlers({ coreApiUrl, getScenario, now, bookingStore }: MockHandlerContext): HttpHandler[] {
  return [
    http.post(`${coreApiUrl}/core/bookings/:bookingId/check-status`, async ({ request, params }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      if (!hasSession(request)) return signedOut();
      if (!request.headers.get('X-Admission-Token')) return admissionInvalid();
      const bookingId = String(params.bookingId);
      const today = now();
      const stored = bookingStore.get(bookingId);
      if (!stored) {
        const fixture = bookingsFixture(today).find((b) => b.bookingId === bookingId);
        return fixture ? HttpResponse.json<Booking>(fixture) : bookingNotFound();
      }
      expireIfDue(stored, today);
      const serverNow = today.toISOString();
      const answer = () => HttpResponse.json<Booking>({ ...stored.booking, serverNow });
      const last = stored.attempts.at(-1);
      if (stored.booking.status !== 'PAYMENT_PENDING' || !last || FINAL_STATUSES.has(last.status)) return answer();
      if (last.firstPolledAt === null) {
        last.firstPolledAt = today.getTime();
        last.status = 'pending';
        return answer();
      }
      const scenario = getScenario();
      if (scenario === 'payment_pending' || today.getTime() - last.firstPolledAt < MOCK_SETTLE_MS) return answer();
      if (scenario === 'payment_denied' && last.attemptId === 1) {
        // The booking stays PAYMENT_PENDING; the next enterPayment opens attempt 2.
        last.status = 'denied';
        bookingStore.save(stored);
        return answer();
      }
      if (scenario === 'payment_late') {
        // ADR-0009: the money arrived after the hold ended: no ticket, flagged for refund.
        last.status = 'paid_after_expiry';
        stored.booking = { ...stored.booking, status: 'EXPIRED', expiresAt: null, refundRequired: true };
        bookingStore.save(stored);
        return answer();
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
      return answer();
    }),
  ];
}
