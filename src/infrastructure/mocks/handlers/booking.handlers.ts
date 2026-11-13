import { delay, http, HttpResponse, type HttpHandler } from 'msw';

import type {
  Booking,
  GetCategoriesResponse,
  ListMyTicketsResponse,
  ValidateAttendeeRequest,
  ValidateAttendeeResponse,
} from '@core/entities/booking/booking.entity';

import { bookingsFixture, MOCK_TICKETS_PDF } from '../fixtures/bookings.fixture';
import { categoriesFixture } from '../fixtures/categories.fixture';
import { eventsFixture } from '../fixtures/events.fixture';
import { ADMISSION_MS, orderWindowMs } from './mock-queue-state';
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

export function bookingHandlers({ coreApiUrl, getScenario, now, queueState }: MockHandlerContext): HttpHandler[] {
  // Per factory, like the auth mock's sessions: each validation token is distinct.
  let validations = 0;
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
        adminFee: { amount: 10000, currency: 'IDR' },
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
    http.get(`${coreApiUrl}/core/bookings/:bookingId`, async ({ request, params }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      if (!hasSession(request)) return signedOut();
      const booking = bookingsFixture(now()).find((b) => b.bookingId === params.bookingId);
      return booking ? HttpResponse.json<Booking>(booking) : problem(404, 'NOT_FOUND', 'Pesanan tidak ditemukan');
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
      return HttpResponse.json<ValidateAttendeeResponse>({
        validationToken: `mock-attendee-${body.fieldIndex}-${validations}`,
        nikMasked: `************${suffix}`,
        expiresAt: new Date(today.getTime() + VALIDATION_WINDOW_MS).toISOString(),
      });
    }),
  ];
}
