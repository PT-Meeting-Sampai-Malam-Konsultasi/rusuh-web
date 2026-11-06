import type { TFunction } from 'i18next';

import type { EventState, EventSummary } from '@core/entities/catalog/catalog.entity';
import { EVENT_STAMP, FINISHED_STATES, JOINABLE_STATES, type EventStampTone } from '@utils/constants/event-state';
import { ROUTES, withQuery } from '@utils/constants/routes';

import {
  DEFAULT_TIME_ZONE,
  formatDayMonth,
  formatEventDate,
  formatPosterDate,
  formatShortDateTime,
  type FormatLocale,
} from './date';
import { durationParts } from './duration';
import { formatCount, formatRupiah } from './number';

export type PosterTone = 'blue' | 'pink' | 'paper' | 'ink';

/** One event, formatted for Home: every string is already translated. */
export interface EventCardView {
  id: string;
  state: EventState;
  name: string;
  subtitle?: string;
  /** "Name — Subtitle" for the card heading. */
  title: string;
  kicker?: string;
  imageUrl?: string;
  posterTone: PosterTone;
  posterDate: string;
  posterPlace: string;
  stamp: { tone: EventStampTone; label: string };
  dateLine: string;
  venueLine: string;
  /** "Mulai" + amount, while tickets can still be bought. */
  price: { label: string; amount: string } | null;
  /** Replaces the price once the sale is over ("Semua 12.000 tiket terjual dalam 41 menit."). */
  outcome: string | null;
  /** Extra line at the bottom of the card: opening time, or why the event is temporarily full. */
  note: { lead: string; strong?: string; detail?: string } | null;
  finished: boolean;
  /** Set while the queue is open and stock remains: where the card leads (the waiting room) and its label. */
  join: { href: string; label: string } | null;
}

export interface EventCardContext {
  t: TFunction;
  locale: FormatLocale;
  /** Server time of the response: relative times never use the device clock. */
  serverNow: string;
}

const CARD_TONES: readonly PosterTone[] = ['pink', 'paper', 'ink', 'blue'];

/** Stable poster colour per event, so a card keeps its look across refreshes. */
export function posterToneFor(eventId: string): PosterTone {
  let hash = 0;
  for (const char of eventId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CARD_TONES[hash % CARD_TONES.length];
}

function timeLeft(ms: number, t: TFunction): string {
  const { days, hours, minutes } = durationParts(ms);
  if (days > 0) return t('home_time_left_days', { days, hours });
  if (hours > 0) return t('home_time_left_hours', { hours, minutes });
  return t('home_time_left_minutes', { minutes: Math.max(1, minutes) });
}

function soldOutIn(ms: number, t: TFunction): string {
  const { days, hours, minutes } = durationParts(ms);
  const totalHours = days * 24 + hours;
  return totalHours > 0
    ? t('home_duration_hours', { hours: totalHours, minutes })
    : t('home_duration_minutes', { minutes: Math.max(1, minutes) });
}

function outcomeFor(event: EventSummary, { t, locale }: EventCardContext, timeZone: string): string | null {
  if (event.state === 'sold_out') {
    if (event.capacity && event.soldOutAt && event.saleOpensAt) {
      const took = Date.parse(event.soldOutAt) - Date.parse(event.saleOpensAt);
      return t('home_sold_out_summary', { count: formatCount(event.capacity, locale), duration: soldOutIn(took, t) });
    }
    return t('home_sold_out_plain');
  }
  if (event.state === 'ended') {
    return event.saleEndsAt
      ? t('home_ended_summary', { date: formatDayMonth(event.saleEndsAt, locale, timeZone) })
      : t('home_ended_plain');
  }
  return null;
}

function noteFor(event: EventSummary, { t, locale, serverNow }: EventCardContext, timeZone: string) {
  if (event.state === 'temporarily_full') return { lead: t('home_temporarily_full_note') };
  const opensAt = event.waitingRoomOpensAt ?? event.saleOpensAt;
  if (event.state === 'coming_soon' && opensAt) {
    const left = Date.parse(opensAt) - Date.parse(serverNow);
    return {
      lead: t('home_opens'),
      strong: formatShortDateTime(opensAt, locale, timeZone),
      detail: left > 0 ? timeLeft(left, t) : undefined,
    };
  }
  return null;
}

export function toEventCardView(event: EventSummary, context: EventCardContext): EventCardView {
  const { t, locale } = context;
  const timeZone = event.timezone ?? DEFAULT_TIME_ZONE;
  const finished = FINISHED_STATES.includes(event.state);
  const stamp = EVENT_STAMP[event.state];
  return {
    id: event.eventId,
    state: event.state,
    name: event.name,
    subtitle: event.subtitle,
    title: event.subtitle ? `${event.name} — ${event.subtitle}` : event.name,
    kicker: event.format,
    imageUrl: event.imageUrl,
    posterTone: posterToneFor(event.eventId),
    posterDate: formatPosterDate(event.startsAt, timeZone),
    posterPlace: [event.venueShort ?? event.venue, event.city].filter(Boolean).join(' · ').toUpperCase(),
    stamp: { tone: stamp.tone, label: t(stamp.labelKey) },
    dateLine: formatEventDate(event.startsAt, locale, timeZone),
    venueLine: [event.venue, event.city].filter(Boolean).join(', '),
    price:
      !finished && event.priceFrom
        ? { label: t('home_price_from'), amount: formatRupiah(event.priceFrom.amount, locale) }
        : null,
    outcome: outcomeFor(event, context, timeZone),
    note: noteFor(event, context, timeZone),
    finished,
    join: JOINABLE_STATES.includes(event.state)
      ? { href: withQuery(ROUTES.QUEUE, { event: event.eventId }), label: t('home_join_queue') }
      : null,
  };
}
