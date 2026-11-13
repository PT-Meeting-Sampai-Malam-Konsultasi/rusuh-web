import { delay, http, HttpResponse, type HttpHandler } from 'msw';

import type {
  ActiveBookingsResponse,
  Attendee,
  Booking,
  CreateBookingTicket,
  EnterPaymentResponse,
  GetCategoriesResponse,
  ListMyTicketsResponse,
  PriceLine,
  ValidateAttendeeRequest,
  ValidateAttendeeResponse,
} from '@core/entities/booking/booking.entity';

import { bookingsFixture, MOCK_TICKETS_PDF } from '../fixtures/bookings.fixture';
import { categoriesFixture } from '../fixtures/categories.fixture';
import { eventsFixture } from '../fixtures/events.fixture';
import { expireIfDue, type StoredBooking } from './mock-booking-store';
import { ADMISSION_MS, orderWindowMs } from './mock-queue-state';
import { FINAL_STATUSES } from './payment.handlers';
import { failure, problem, problemWith, type MockHandlerContext } from './shared';

const admissionInvalid = () => problem(403, 'ADMISSION_INVALID', 'Giliran tidak berlaku');
const signedOut = () => problem(401, 'UNAUTHORIZED', 'Sesi berakhir');
/** Presence only, like the admission token: a token from the mocked sign-in (or the real auth API) passes. */
const hasSession = (request: Request) => request.headers.get('Authorization')?.startsWith('Bearer ') === true;

/** Visible "Memeriksa ke Dukcapil…" in dev; the real check has a 2 s timeout. */
export const MOCK_DUKCAPIL_LATENCY_MS = 600;
/**
 * The NIK's last 4 digits pick the outcome; any other 16-digit NIK passes. The mock does not model DUPLICATE_NIK per
 * order (the client catches repeats) nor the 3-attempts-per-minute counter per field: only `6666` answers 429.
 */
export const MOCK_NIK_SUFFIX = {
  NIK_INVALID: '9999',
  NIK_SEAT_TAKEN: '8888',
  DUKCAPIL_UNAVAILABLE: '7777',
  RATE_LIMITED: '6666',
} as const;
export const MOCK_RETRY_AFTER_S = 60;
const VALIDATION_WINDOW_MS = 5 * 60_000;

/** Fixed per order (ADR-0010): the categories answer and the created booking use the same amount. */
export const MOCK_ADMIN_FEE = 10000;
/** SELECTION lasts 5 minutes from create (D5). */
const SELECTION_MS = 5 * 60_000;
/** PAYMENT_PENDING lasts 10 minutes from payment entry (ADR-0005). */
const PAYMENT_MS = 10 * 60_000;
/** `?mock=short_payment`: 30 s of the ink timer, pink from 2:00, then 0:00 and EXPIRED on the next read. */
export const MOCK_SHORT_PAYMENT_WINDOW_MS = 150_000;
/** The categories answer's reservedUnits. */
const MOCK_RESERVED_UNITS = 3;
const MAX_TICKETS_PER_ORDER = 3;
const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** "3174 •••• •••• 0004": first 4 and last 4 digits (ADR-0024). */
const maskNik = (nik: string) => `${nik.slice(0, 4)} •••• •••• ${nik.slice(-4)}`;
const bookingNotFound = () => problem(404, 'NOT_FOUND', 'Pesanan tidak ditemukan');

interface CreateBookingBody {
  eventId: string;
  tickets: CreateBookingTicket[];
}

const isTicket = (value: unknown): value is CreateBookingTicket => {
  if (typeof value !== 'object' || value === null) return false;
  const { categoryId, validationToken } = value as Partial<Record<keyof CreateBookingTicket, unknown>>;
  return typeof categoryId === 'string' && typeof validationToken === 'string';
};

const isCreateBody = (body: unknown): body is CreateBookingBody => {
  if (typeof body !== 'object' || body === null) return false;
  const { eventId, tickets } = body as Partial<Record<keyof CreateBookingBody, unknown>>;
  return (
    typeof eventId === 'string' &&
    Array.isArray(tickets) &&
    tickets.length >= 1 &&
    tickets.length <= MAX_TICKETS_PER_ORDER &&
    tickets.every(isTicket)
  );
};

const idr = (amount: number) => ({ amount, currency: 'IDR' as const });

/** Titles never carry the NIK or the name. */
const validationFailed = () => problem(422, 'VALIDATION_FAILED', 'Data tidak lengkap');
const nikInvalid = () => problem(422, 'NIK_INVALID', 'Nama dan NIK tidak cocok');

const isValidBody = (body: unknown): body is ValidateAttendeeRequest => {
  if (typeof body !== 'object' || body === null) return false;
  const { fieldIndex, fullName } = body as Partial<Record<keyof ValidateAttendeeRequest, unknown>>;
  return (
    Number.isInteger(fieldIndex) &&
    (fieldIndex as number) >= 0 &&
    (fieldIndex as number) <= 2 &&
    typeof fullName === 'string' &&
    fullName.trim() !== ''
  );
};

export function bookingHandlers({
  coreApiUrl,
  getScenario,
  now,
  queueState,
  bookingStore,
}: MockHandlerContext): HttpHandler[] {
  // Per factory, like the auth mock's sessions: each validation token is distinct.
  let validations = 0;
  let created = 0;

  /** A SELECTION booking from validated tickets: one attendee per ticket, the admin fee once per order. */
  const newBooking = (body: CreateBookingBody, today: Date): Booking => {
    const categories = categoriesFixture('id');
    const lines: PriceLine[] = [];
    const attendees: Attendee[] = body.tickets.map(({ categoryId, validationToken }) => {
      const category = categories.find((c) => c.categoryId === categoryId)!;
      const line = lines.find((l) => l.categoryId === categoryId);
      if (line) {
        line.quantity += 1;
        line.lineTotal = idr(line.unitPrice.amount * line.quantity);
      } else {
        lines.push({
          categoryId,
          name: category.name,
          quantity: 1,
          unitPrice: category.price,
          lineTotal: category.price,
        });
      }
      const { fullName, nikMasked } = bookingStore.attendee(validationToken)!;
      return { categoryId, categoryName: category.name, fullName, nikMasked };
    });
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal.amount, 0);
    created += 1;
    return {
      bookingId: `bk_mock_${created}`,
      eventId: body.eventId,
      status: 'SELECTION',
      price: {
        lines,
        ticketSubtotal: idr(subtotal),
        adminFee: idr(MOCK_ADMIN_FEE),
        total: idr(subtotal + MOCK_ADMIN_FEE),
      },
      orderCode: bookingStore.nextOrderCode(),
      attendees,
      expiresAt: new Date(today.getTime() + SELECTION_MS).toISOString(),
      refundRequired: false,
      tickets: [],
      paidAt: null,
      paymentMethod: null,
      createdAt: today.toISOString(),
      serverNow: today.toISOString(),
    };
  };

  const withServerNow = (entry: StoredBooking, today: Date): Booking => ({
    ...entry.booking,
    serverNow: today.toISOString(),
  });

  return [
    http.get(`${coreApiUrl}/core/events/:eventId/categories`, async ({ request, params }) => {
      const scenario = getScenario();
      const failed = await failure(scenario);
      if (failed) return failed;
      if (scenario === 'admission_invalid') return admissionInvalid();
      // Presence only, not the value: tokens from a mocked claimTurn (FR-08-W1) pass too.
      if (!request.headers.get('X-Admission-Token')) return admissionInvalid();
      const eventId = String(params.eventId);
      const today = now();
      // A token cannot match an event that does not exist; getCategories lists no 404.
      if (!eventsFixture(today).some((e) => e.eventId === eventId)) return admissionInvalid();
      const locale = request.headers.get('Accept-Language')?.toLowerCase().startsWith('en') ? 'en' : 'id';
      let categories = categoriesFixture(locale);
      if (scenario === 'sold_out') categories = categories.map((c) => ({ ...c, availability: 'sold_out' }));
      const time = today.getTime();
      const admittedAt = queueState.lastAdmittedAt(eventId);
      // FR-19-W1: like the server, the window is the claim's lease end, the same on every request; a past end is
      // answered as is. No (recent) claim, e.g. /order opened directly in the mock: a window from now, as before.
      const start = admittedAt !== null && time - admittedAt < ADMISSION_MS ? admittedAt : time;
      return HttpResponse.json<GetCategoriesResponse>({
        eventId,
        categories,
        maxTicketsPerOrder: 3,
        reservedUnits: 3,
        adminFee: idr(MOCK_ADMIN_FEE),
        expiresAt: new Date(start + orderWindowMs(scenario)).toISOString(),
        serverNow: today.toISOString(),
      });
    }),
    // FR-22-W1: My tickets (`?mock=empty` shows none), one booking, and its PDF.
    http.get(`${coreApiUrl}/core/tickets`, async ({ request }) => {
      const scenario = getScenario();
      const failed = await failure(scenario);
      if (failed) return failed;
      if (!hasSession(request)) return signedOut();
      const items = scenario === 'empty' ? [] : bookingsFixture(now()).flatMap((b) => b.tickets ?? []);
      return HttpResponse.json<ListMyTicketsResponse>({ items });
    }),
    // FR-16-W1: before `:bookingId`, or MSW reads "active" as a booking id.
    http.get(`${coreApiUrl}/core/bookings/active`, async ({ request }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      if (!hasSession(request)) return signedOut();
      const today = now();
      const items = bookingStore.active(today).map((entry) => withServerNow(entry, today));
      return HttpResponse.json<ActiveBookingsResponse>({ items });
    }),
    http.get(`${coreApiUrl}/core/bookings/:bookingId`, async ({ request, params }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      if (!hasSession(request)) return signedOut();
      const today = now();
      // Bookings made in this tab first (FR-16-W1), then the paid fixtures.
      const stored = bookingStore.get(String(params.bookingId));
      if (stored) return HttpResponse.json<Booking>(withServerNow(expireIfDue(stored, today), today));
      const booking = bookingsFixture(today).find((b) => b.bookingId === params.bookingId);
      return booking ? HttpResponse.json<Booking>(booking) : bookingNotFound();
    }),
    http.get(`${coreApiUrl}/core/bookings/:bookingId/tickets.pdf`, async ({ request, params }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      if (!hasSession(request)) return signedOut();
      const booking = bookingsFixture(now()).find((b) => b.bookingId === params.bookingId);
      if (!booking) return problem(404, 'NOT_FOUND', 'Pesanan tidak ditemukan');
      if (booking.status !== 'PAID') return problem(409, 'BOOKING_NOT_PAID', 'Pesanan belum lunas');
      return new HttpResponse(MOCK_TICKETS_PDF, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${booking.orderCode}.pdf"`,
        },
      });
    }),
    http.post(`${coreApiUrl}/core/events/:eventId/attendees/validate`, async ({ request, params }) => {
      const scenario = getScenario();
      const failed = await failure(scenario);
      if (failed) return failed;
      if (scenario === 'admission_invalid') return admissionInvalid();
      if (!request.headers.get('X-Admission-Token')) return admissionInvalid();
      const today = now();
      if (!eventsFixture(today).some((e) => e.eventId === String(params.eventId))) return admissionInvalid();
      const body: unknown = await request.json().catch(() => null);
      if (!isValidBody(body)) return validationFailed();
      const nik = typeof body.nik === 'string' ? body.nik : '';
      if (!/^\d{16}$/.test(nik)) return nikInvalid();
      await delay(MOCK_DUKCAPIL_LATENCY_MS);
      const suffix = nik.slice(-4);
      if (scenario === 'dukcapil_down' || suffix === MOCK_NIK_SUFFIX.DUKCAPIL_UNAVAILABLE) {
        return problem(503, 'DUKCAPIL_UNAVAILABLE', 'Dukcapil sedang sibuk');
      }
      if (suffix === MOCK_NIK_SUFFIX.NIK_INVALID) return nikInvalid();
      if (suffix === MOCK_NIK_SUFFIX.NIK_SEAT_TAKEN) {
        return problem(409, 'NIK_SEAT_TAKEN', 'NIK sudah terdaftar untuk event ini');
      }
      if (suffix === MOCK_NIK_SUFFIX.RATE_LIMITED) {
        return problemWith(
          429,
          'RATE_LIMITED',
          'Terlalu banyak percobaan',
          { retryAfter: MOCK_RETRY_AFTER_S },
          { 'Retry-After': String(MOCK_RETRY_AFTER_S) },
        );
      }
      validations += 1;
      const validationToken = `mock-attendee-${body.fieldIndex}-${validations}`;
      // In memory only, and only the mask: createBooking turns the token back into the booking's attendee.
      bookingStore.rememberAttendee(validationToken, { fullName: body.fullName.trim(), nikMasked: maskNik(nik) });
      return HttpResponse.json<ValidateAttendeeResponse>({
        validationToken,
        nikMasked: `************${suffix}`,
        expiresAt: new Date(today.getTime() + VALIDATION_WINDOW_MS).toISOString(),
      });
    }),
    // FR-16-W1: a SELECTION booking (5 min); the stock hold happens at payment entry. First match wins, top to bottom.
    http.post(`${coreApiUrl}/core/bookings`, async ({ request }) => {
      const scenario = getScenario();
      const failed = await failure(scenario);
      if (failed) return failed;
      if (!hasSession(request)) return signedOut();
      const body: unknown = await request.json().catch(() => null);
      const today = now();
      if (scenario === 'admission_invalid' || !request.headers.get('X-Admission-Token')) return admissionInvalid();
      const eventId = (body as { eventId?: unknown } | null)?.eventId;
      // A token cannot match an event that does not exist; a missing eventId is a bad body (422 below).
      if (typeof eventId === 'string' && !eventsFixture(today).some((e) => e.eventId === eventId)) {
        return admissionInvalid();
      }
      const key = request.headers.get(IDEMPOTENCY_KEY_HEADER);
      if (!key) return validationFailed();
      const replay = bookingStore.byKey(key);
      if (replay) return HttpResponse.json<Booking>(withServerNow(replay, today), { status: 201 });
      const categories = categoriesFixture('id');
      if (!isCreateBody(body) || body.tickets.some((t) => !categories.some((c) => c.categoryId === t.categoryId))) {
        return validationFailed();
      }
      const { tickets } = body;
      // Unreachable while both limits are 3; kept for when reservedUnits is lower than the order maximum.
      if (tickets.length > MOCK_RESERVED_UNITS) {
        return problemWith(409, 'QUANTITY_OVER_RESERVATION', 'Jumlah tiket melebihi jatah Anda', {
          categoryId: tickets[0].categoryId,
        });
      }
      if (tickets.some((t) => !bookingStore.attendee(t.validationToken))) {
        return problem(409, 'ATTENDEE_NOT_VALIDATED', 'Data pemegang tiket belum divalidasi');
      }
      if (new Set(tickets.map((t) => t.validationToken)).size !== tickets.length) {
        return problem(409, 'DUPLICATE_NIK', 'NIK yang sama dipakai lebih dari sekali');
      }
      const soldOut =
        scenario === 'category_sold_out'
          ? tickets[0]
          : tickets.find((t) => categories.find((c) => c.categoryId === t.categoryId)?.availability === 'sold_out');
      if (soldOut) {
        return problemWith(409, 'CATEGORY_SOLD_OUT', 'Kategori sudah habis', { categoryId: soldOut.categoryId });
      }
      if (bookingStore.active(today, body.eventId).length > 0) {
        return problem(409, 'ACCOUNT_HAS_ACTIVE_BOOKING', 'Anda masih punya pesanan aktif');
      }
      const booking = newBooking(body, today);
      bookingStore.save({ booking, idempotencyKey: key, snapToken: null, paymentEntries: 0, attempts: [] });
      return HttpResponse.json<Booking>(booking, { status: 201 });
    }),
    // FR-16-W1: the stock + NIK hold, SELECTION → PAYMENT_PENDING (10 min), and the Snap token.
    http.post(`${coreApiUrl}/core/bookings/:bookingId/payment`, async ({ request, params }) => {
      const scenario = getScenario();
      const failed = await failure(scenario);
      if (failed) return failed;
      if (!hasSession(request)) return signedOut();
      if (scenario === 'admission_invalid' || !request.headers.get('X-Admission-Token')) return admissionInvalid();
      const entry = bookingStore.get(String(params.bookingId));
      if (!entry) return bookingNotFound();
      const today = now();
      entry.paymentEntries += 1;
      expireIfDue(entry, today);
      bookingStore.save(entry);
      const { booking } = entry;
      const answer = (): EnterPaymentResponse => ({
        bookingId: booking.bookingId,
        snapToken: entry.snapToken!,
        paymentExpiresAt: entry.booking.expiresAt!,
        redirectUrl: null,
        serverNow: today.toISOString(),
      });
      if (booking.status === 'PAYMENT_PENDING') {
        // FR-20-W1: "Bayar" on the payment page calls this again; snap_busy fails that first call.
        if (scenario === 'snap_busy' && entry.paymentEntries === 2) {
          return problem(503, 'PAYMENT_PROVIDER_BUSY', 'Layanan pembayaran sedang sibuk');
        }
        // Idempotent: the live token and deadline again; after a failed attempt (denied …), the next attempt's.
        const last = entry.attempts.at(-1);
        if (last && FINAL_STATUSES.has(last.status)) {
          const attemptId = last.attemptId + 1;
          entry.snapToken = `mock-snap-${booking.bookingId}-${attemptId}`;
          entry.attempts.push({ attemptId, snapToken: entry.snapToken, status: 'none', firstPolledAt: null });
          bookingStore.save(entry);
        }
        return HttpResponse.json<EnterPaymentResponse>(answer());
      }
      if (booking.status !== 'SELECTION') return problem(409, 'BOOKING_NOT_HELD', 'Pesanan tidak lagi aktif');
      if (scenario === 'payment_busy' && entry.paymentEntries === 1) {
        return problem(503, 'PAYMENT_PROVIDER_BUSY', 'Layanan pembayaran sedang sibuk');
      }
      if (scenario === 'nik_seat_taken') {
        const last = booking.attendees?.at(-1);
        return problemWith(409, 'NIK_SEAT_TAKEN', 'NIK sudah terdaftar untuk event ini', {
          nikMasked: last?.nikMasked,
        });
      }
      entry.snapToken = `mock-snap-${booking.bookingId}-1`;
      // FR-20-W1: the payment entry's token is Snap attempt 1, the one "Bayar" opens.
      if (entry.attempts.length === 0) {
        entry.attempts.push({ attemptId: 1, snapToken: entry.snapToken, status: 'none', firstPolledAt: null });
      }
      entry.booking = {
        ...booking,
        status: 'PAYMENT_PENDING',
        expiresAt: new Date(
          today.getTime() + (scenario === 'short_payment' ? MOCK_SHORT_PAYMENT_WINDOW_MS : PAYMENT_MS),
        ).toISOString(),
      };
      bookingStore.save(entry);
      return HttpResponse.json<EnterPaymentResponse>(answer());
    }),
  ];
}
