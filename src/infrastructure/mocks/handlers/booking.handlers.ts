import { http, HttpResponse, type HttpHandler } from 'msw';

import type { Booking, GetCategoriesResponse, ListMyTicketsResponse } from '@core/entities/booking/booking.entity';

import { bookingsFixture, MOCK_TICKETS_PDF } from '../fixtures/bookings.fixture';
import { categoriesFixture } from '../fixtures/categories.fixture';
import { eventsFixture } from '../fixtures/events.fixture';
import { failure, problem, type MockContext } from './shared';

const ORDER_WINDOW_MS = 5 * 60_000;

const admissionInvalid = () => problem(403, 'ADMISSION_INVALID', 'Giliran tidak berlaku');
const signedOut = () => problem(401, 'UNAUTHORIZED', 'Sesi berakhir');
/** Presence only, like the admission token: a token from the mocked sign-in (or the real auth API) passes. */
const hasSession = (request: Request) => request.headers.get('Authorization')?.startsWith('Bearer ') === true;

export function bookingHandlers({ coreApiUrl, getScenario, now }: MockContext): HttpHandler[] {
  return [
    http.get(`${coreApiUrl}/events/:eventId/categories`, async ({ request, params }) => {
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
      return HttpResponse.json<GetCategoriesResponse>({
        eventId,
        categories,
        maxTicketsPerOrder: 3,
        reservedUnits: 3,
        adminFee: { amount: 10000, currency: 'IDR' },
        expiresAt: new Date(today.getTime() + ORDER_WINDOW_MS).toISOString(),
        serverNow: today.toISOString(),
      });
    }),
    // FR-22-W1: My tickets (`?mock=empty` shows none), one booking, and its PDF.
    http.get(`${coreApiUrl}/tickets`, async ({ request }) => {
      const scenario = getScenario();
      const failed = await failure(scenario);
      if (failed) return failed;
      if (!hasSession(request)) return signedOut();
      const items = scenario === 'empty' ? [] : bookingsFixture(now()).flatMap((b) => b.tickets ?? []);
      return HttpResponse.json<ListMyTicketsResponse>({ items });
    }),
    http.get(`${coreApiUrl}/bookings/:bookingId`, async ({ request, params }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      if (!hasSession(request)) return signedOut();
      const booking = bookingsFixture(now()).find((b) => b.bookingId === params.bookingId);
      return booking ? HttpResponse.json<Booking>(booking) : problem(404, 'NOT_FOUND', 'Pesanan tidak ditemukan');
    }),
    http.get(`${coreApiUrl}/bookings/:bookingId/tickets.pdf`, async ({ request, params }) => {
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
  ];
}
