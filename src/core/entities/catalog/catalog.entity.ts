// Catalog types, matching rusuh-documentation/api/openapi.yaml (EventSummary, EventState, Money, listEvents).

/** Home status stamp. `temporarily_full`: every unit is reserved or held; unpaid ones return within ~10 minutes. */
export type EventState =
  'coming_soon' | 'waiting_room_open' | 'on_sale' | 'almost_gone' | 'temporarily_full' | 'sold_out' | 'ended';

export interface Money {
  /** Whole rupiah. */
  amount: number;
  currency: 'IDR';
}

export interface EventSummary {
  eventId: string;
  name: string;
  subtitle?: string;
  /** Poster kicker: Live, Festival, Tour, … */
  format?: string;
  venue: string;
  /** For tight places (poster, payment summary). */
  venueShort?: string;
  city?: string;
  /** IANA zone of the venue; times are shown in it (WIB, WITA, WIT). */
  timezone?: string;
  startsAt: string;
  doorsOpenAt?: string;
  saleOpensAt?: string;
  /** 30 minutes before the sale (Q-34). */
  waitingRoomOpensAt?: string;
  saleEndsAt?: string;
  state: EventState;
  priceFrom?: Money;
  /** Tickets on sale in total. */
  capacity?: number;
  /** Set when the event sold out. */
  soldOutAt?: string | null;
  imageUrl?: string;
}

export interface ListEventsResponse {
  items: EventSummary[];
  serverNow: string;
}
