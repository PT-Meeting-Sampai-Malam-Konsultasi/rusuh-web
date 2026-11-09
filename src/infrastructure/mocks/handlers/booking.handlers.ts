import { http, HttpResponse, type HttpHandler } from 'msw';

import type { GetCategoriesResponse } from '@core/entities/booking/booking.entity';

import { categoriesFixture } from '../fixtures/categories.fixture';
import { eventsFixture } from '../fixtures/events.fixture';
import { failure, problem, type MockContext } from './shared';

const ORDER_WINDOW_MS = 5 * 60_000;

const admissionInvalid = () => problem(403, 'ADMISSION_INVALID', 'Giliran tidak berlaku');

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
  ];
}
