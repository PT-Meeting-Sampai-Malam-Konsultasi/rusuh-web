import { http, HttpResponse } from 'msw';

import type { ListEventsResponse } from '@core/entities/catalog/catalog.entity';

import { eventsFixture } from '../fixtures/events.fixture';
import { failure, type MockContext } from './shared';

export function catalogHandlers({ coreApiUrl, getScenario, now }: MockContext) {
  return [
    http.get(`${coreApiUrl}/events`, async () => {
      const scenario = getScenario();
      const failed = await failure(scenario);
      if (failed) return failed;
      const today = now();
      let items = eventsFixture(today);
      if (scenario === 'empty') items = [];
      if (scenario === 'sold_out') {
        items = items.map((e) =>
          e.state === 'ended' ? e : { ...e, state: 'sold_out', soldOutAt: e.soldOutAt ?? today.toISOString() },
        );
      }
      return HttpResponse.json<ListEventsResponse>(
        { items, serverNow: today.toISOString() },
        { headers: { 'Cache-Control': 'public, max-age=5, stale-while-revalidate=30' } },
      );
    }),
  ];
}
