import type { EventState, EventSummary } from '@core/entities/catalog/catalog.entity';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export interface HomeEvents {
  /** The poster hero; null when no event can still be bought or queued for. */
  featured: EventSummary | null;
  /** Every other event, in display order. */
  others: EventSummary[];
  total: number;
  serverNow: string;
}

export interface GetHomeEventsUseCaseInterface {
  execute: () => Promise<HomeEvents>;
}

/** Display order: events you can act on first, finished ones last (PRD H-1: they stay visible). */
const STATE_RANK: Record<EventState, number> = {
  waiting_room_open: 0,
  on_sale: 0,
  almost_gone: 0,
  coming_soon: 1,
  temporarily_full: 2,
  sold_out: 3,
  ended: 4,
};

const FEATURABLE_RANK = STATE_RANK.temporarily_full;

const time = (iso: string | undefined) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY);

const byHomeOrder = (a: EventSummary, b: EventSummary) =>
  STATE_RANK[a.state] - STATE_RANK[b.state] ||
  time(a.saleOpensAt) - time(b.saleOpensAt) ||
  time(a.startsAt) - time(b.startsAt);

export const GetHomeEventsUseCase = ({
  catalogService,
}: Pick<AwilixRegistry, 'catalogService'>): GetHomeEventsUseCaseInterface => ({
  execute: async () => {
    const { data } = await catalogService.listEvents();
    const ordered = [...data.items].sort(byHomeOrder);
    const first = ordered[0];
    const featured = first && STATE_RANK[first.state] <= FEATURABLE_RANK ? first : null;
    return {
      featured,
      others: featured ? ordered.slice(1) : ordered,
      total: ordered.length,
      serverNow: data.serverNow,
    };
  },
});
