import type { EventState } from '@core/entities/catalog/catalog.entity';

/** Stamp styles from the design system (Stamp component tones). */
export type EventStampTone = 'on' | 'soon' | 'full' | 'sold' | 'ended';

/** Home status stamps (App Flow 4.1): one style and one label per state; the word carries the meaning. */
export const EVENT_STAMP: Readonly<Record<EventState, { tone: EventStampTone; labelKey: string }>> = {
  coming_soon: { tone: 'soon', labelKey: 'event_state_coming_soon' },
  waiting_room_open: { tone: 'on', labelKey: 'event_state_queue_open' },
  on_sale: { tone: 'on', labelKey: 'event_state_queue_open' },
  almost_gone: { tone: 'on', labelKey: 'event_state_almost_gone' },
  temporarily_full: { tone: 'full', labelKey: 'event_state_temporarily_full' },
  sold_out: { tone: 'sold', labelKey: 'event_state_sold_out' },
  ended: { tone: 'ended', labelKey: 'event_state_ended' },
};

/** States whose sale is over: shown, but nothing left to buy. */
export const FINISHED_STATES: readonly EventState[] = ['sold_out', 'ended'];
