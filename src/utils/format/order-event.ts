import type { TFunction } from 'i18next';

import type { Category, CategoryAvailability } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';

import { DEFAULT_TIME_ZONE, formatEventDate, type FormatLocale } from './date';
import { posterToneFor, type PosterTone } from './event-card';
import { formatRupiah } from './number';

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

/** One category row: name, availability label and price (stepper comes with FR-13-W1). */
export interface OrderCategoryView {
  id: string;
  name: string;
  description?: string;
  /** "Rp 1.250.000" (ID) / "Rp 1,250,000" (EN). */
  price: string;
  /** Null when the server sent a value outside the enum: the row shows no label. */
  availability: CategoryAvailability | null;
  /** "Tersedia" / "Hampir habis" / "Habis" (EN "Available" / "Almost gone" / "Sold out"); '' when availability is null. */
  availabilityLabel: string;
  /** availability === 'sold_out'. */
  soldOut: boolean;
}

/** Translation key per availability value. */
export const ORDER_AVAILABILITY_LABEL_KEY: Record<CategoryAvailability, string> = {
  available: 'order_availability_available',
  almost_gone: 'order_availability_almost_gone',
  sold_out: 'order_availability_sold_out',
};

/** Runtime guard: the type is a closed enum, the payload is not. Own keys only, so 'toString' never passes. */
export function isCategoryAvailability(value: unknown): value is CategoryAvailability {
  return typeof value === 'string' && Object.hasOwn(ORDER_AVAILABILITY_LABEL_KEY, value);
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

/**
 * An availability outside the enum shows no label and is not marked sold out: never claim stock the server did not
 * confirm, never block a category on sale; the hold re-checks stock atomically (FR-14-W1).
 */
export function toOrderCategoryView(category: Category, locale: FormatLocale, t: TFunction): OrderCategoryView {
  const availability = isCategoryAvailability(category.availability) ? category.availability : null;
  return {
    id: category.categoryId,
    name: category.name,
    description: category.description,
    price: formatRupiah(category.price.amount, locale),
    availability,
    availabilityLabel: availability ? t(ORDER_AVAILABILITY_LABEL_KEY[availability]) : '',
    soldOut: availability === 'sold_out',
  };
}
