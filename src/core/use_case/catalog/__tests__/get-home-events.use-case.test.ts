import { describe, expect, it, vi } from 'vitest';

import type { EventState, EventSummary } from '@core/entities/catalog/catalog.entity';

import { GetHomeEventsUseCase } from '../get-home-events.use-case';

const NOW = '2026-11-03T03:00:00Z';

const event = (eventId: string, state: EventState, extra: Partial<EventSummary> = {}): EventSummary => ({
  eventId,
  name: eventId,
  venue: 'Venue',
  startsAt: '2026-12-12T12:00:00Z',
  state,
  ...extra,
});

const run = async (items: EventSummary[]) => {
  const catalogService = {
    listEvents: vi.fn().mockResolvedValue({ data: { items, serverNow: NOW }, status: 200 }),
    getEvent: vi.fn(),
  };
  return GetHomeEventsUseCase({ catalogService }).execute();
};

const ids = (list: EventSummary[]) => list.map((e) => e.eventId);

describe('GetHomeEventsUseCase', () => {
  it('orders live, coming soon, temporarily full, sold out, then ended', async () => {
    const result = await run([
      event('ended', 'ended'),
      event('sold', 'sold_out'),
      event('soon', 'coming_soon'),
      event('full', 'temporarily_full'),
      event('live', 'on_sale'),
    ]);
    expect(result.featured?.eventId).toBe('live');
    expect(ids(result.others)).toEqual(['soon', 'full', 'sold', 'ended']);
    expect(result.total).toBe(5);
    expect(result.serverNow).toBe(NOW);
  });

  it('treats every live state as equal and breaks ties by sale opening, then start', async () => {
    const result = await run([
      event('late-sale', 'almost_gone', { saleOpensAt: '2026-11-02T03:00:00Z' }),
      event('no-sale-date', 'on_sale'),
      event('early-sale', 'waiting_room_open', { saleOpensAt: '2026-11-01T03:00:00Z' }),
      event('same-sale-later-show', 'on_sale', {
        saleOpensAt: '2026-11-02T03:00:00Z',
        startsAt: '2027-01-01T12:00:00Z',
      }),
    ]);
    expect(result.featured?.eventId).toBe('early-sale');
    expect(ids(result.others)).toEqual(['late-sale', 'same-sale-later-show', 'no-sale-date']);
  });

  it('features a coming-soon or temporarily full event when nothing is live', async () => {
    expect((await run([event('sold', 'sold_out'), event('soon', 'coming_soon')])).featured?.eventId).toBe('soon');
    expect((await run([event('ended', 'ended'), event('full', 'temporarily_full')])).featured?.eventId).toBe('full');
  });

  it('features nothing when every event is sold out or ended, and keeps them all listed', async () => {
    const result = await run([event('ended', 'ended'), event('sold', 'sold_out')]);
    expect(result.featured).toBeNull();
    expect(ids(result.others)).toEqual(['sold', 'ended']);
    expect(result.total).toBe(2);
  });

  it('handles an empty list', async () => {
    expect(await run([])).toEqual({ featured: null, others: [], total: 0, serverNow: NOW });
  });

  it('does not mutate the response', async () => {
    const items = [event('b', 'ended'), event('a', 'on_sale')];
    await run(items);
    expect(ids(items)).toEqual(['b', 'a']);
  });

  it('lets infrastructure errors through', async () => {
    const error = { status: 503, code: 'INTERNAL_ERROR', message: 'down' };
    const catalogService = { listEvents: vi.fn().mockRejectedValue(error), getEvent: vi.fn() };
    await expect(GetHomeEventsUseCase({ catalogService }).execute()).rejects.toBe(error);
  });
});
