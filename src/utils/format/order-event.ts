import type { Category } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';

import { DEFAULT_TIME_ZONE, formatEventDate, type FormatLocale } from './date';
import { posterToneFor, type PosterTone } from './event-card';

/** The event, formatted for the order page header. */
export interface OrderEventView {
  id: string;
  name: string;
  subtitle?: string;
  imageUrl?: string;
  /** posterToneFor(eventId): the same colour as the Home card. */
  posterTone: PosterTone;
  /** "Sab, 12 Des 2026 · 19.00 WIB · Stadion Utama GBK, Jakarta" in the event time zone. */
  metaLine: string;
}

/** One category for the read-only list (price and availability come with FR-12-W1). */
export interface OrderCategoryView {
  id: string;
  name: string;
  description?: string;
}

export function toOrderEventView(event: EventSummary, locale: FormatLocale): OrderEventView {
  const date = formatEventDate(event.startsAt, locale, event.timezone ?? DEFAULT_TIME_ZONE);
  const place = [event.venue, event.city].filter(Boolean).join(', ');
  return {
    id: event.eventId,
    name: event.name,
    subtitle: event.subtitle,
    imageUrl: event.imageUrl,
    posterTone: posterToneFor(event.eventId),
    metaLine: [date, place].join(' · '),
  };
}

export function toOrderCategoryView(category: Category): OrderCategoryView {
  return { id: category.categoryId, name: category.name, description: category.description };
}
