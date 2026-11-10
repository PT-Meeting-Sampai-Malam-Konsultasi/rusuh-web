import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import type { Category } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';

import { posterToneFor } from '../event-card';
import {
  isCategoryAvailability,
  ORDER_AVAILABILITY_LABEL_KEY,
  toOrderCategoryView,
  toOrderEventView,
} from '../order-event';

const base: EventSummary = {
  eventId: 'evt_samudra',
  name: 'Samudra',
  subtitle: 'Tur Gelombang 2026',
  venue: 'Stadion Utama GBK',
  city: 'Jakarta',
  timezone: 'Asia/Jakarta',
  imageUrl: 'https://cdn.test/samudra.jpg',
  startsAt: '2026-12-12T12:00:00Z',
  state: 'on_sale',
};

describe('toOrderEventView', () => {
  it('formats the header in Indonesian', () => {
    expect(toOrderEventView(base, 'id')).toEqual({
      id: 'evt_samudra',
      name: 'Samudra',
      subtitle: 'Tur Gelombang 2026',
      imageUrl: 'https://cdn.test/samudra.jpg',
      posterTone: posterToneFor('evt_samudra'),
      metaLine: 'Sab, 12 Des 2026 · 19.00 WIB · Stadion Utama GBK, Jakarta',
    });
  });

  it('formats the header in English', () => {
    expect(toOrderEventView(base, 'en').metaLine).toBe('Sat, 12 Dec 2026 · 7.00 pm WIB · Stadion Utama GBK, Jakarta');
  });

  it('drops a missing city', () => {
    expect(toOrderEventView({ ...base, city: undefined }, 'id').metaLine).toBe(
      'Sab, 12 Des 2026 · 19.00 WIB · Stadion Utama GBK',
    );
  });

  it('uses Asia/Jakarta when the event has no time zone', () => {
    expect(toOrderEventView({ ...base, timezone: undefined }, 'id').metaLine).toContain('19.00 WIB');
  });

  it('uses the event time zone, not the device one', () => {
    const bali = { ...base, venue: 'GWK', city: 'Bali', timezone: 'Asia/Makassar' };
    expect(toOrderEventView(bali, 'id').metaLine).toBe('Sab, 12 Des 2026 · 20.00 WITA · GWK, Bali');
  });
});

describe('toOrderCategoryView', () => {
  /** Echoes the key, so a label can only come from ORDER_AVAILABILITY_LABEL_KEY. */
  const t = ((key: string) => `t:${key}`) as unknown as TFunction;

  const category: Category = {
    categoryId: 'cat_festival',
    name: 'Festival',
    description: 'Berdiri, dekat panggung',
    seating: 'standing',
    entryGate: 'A',
    price: { amount: 1250000, currency: 'IDR' },
    availability: 'available',
    available: 120,
  };

  it.each([
    ['available', 't:order_availability_available', false],
    ['almost_gone', 't:order_availability_almost_gone', false],
    ['sold_out', 't:order_availability_sold_out', true],
  ] as const)('maps %s in Indonesian', (availability, label, soldOut) => {
    expect(toOrderCategoryView({ ...category, availability }, 'id', t)).toEqual({
      id: 'cat_festival',
      name: 'Festival',
      description: 'Berdiri, dekat panggung',
      price: 'Rp 1.250.000',
      availability,
      availabilityLabel: label,
      soldOut,
    });
  });

  it.each([
    ['available', 't:order_availability_available', false],
    ['almost_gone', 't:order_availability_almost_gone', false],
    ['sold_out', 't:order_availability_sold_out', true],
  ] as const)('maps %s in English', (availability, label, soldOut) => {
    expect(toOrderCategoryView({ ...category, availability }, 'en', t)).toEqual({
      id: 'cat_festival',
      name: 'Festival',
      description: 'Berdiri, dekat panggung',
      price: 'Rp 1,250,000',
      availability,
      availabilityLabel: label,
      soldOut,
    });
  });

  it('shows no label for an unknown availability, keeps the price and does not mark it sold out', () => {
    const view = toOrderCategoryView({ ...category, availability: 'paused' as never }, 'id', t);
    expect(view.availability).toBeNull();
    expect(view.availabilityLabel).toBe('');
    expect(view.soldOut).toBe(false);
    expect(view.price).toBe('Rp 1.250.000');
    expect(JSON.stringify(view)).not.toContain('paused');
  });

  it('does not expose the available count', () => {
    expect(toOrderCategoryView(category, 'id', t)).not.toHaveProperty('available');
  });

  it('keeps a missing description undefined', () => {
    expect(toOrderCategoryView({ ...category, description: undefined }, 'id', t).description).toBeUndefined();
  });
});

describe('ORDER_AVAILABILITY_LABEL_KEY', () => {
  it('has one key per availability value', () => {
    expect(ORDER_AVAILABILITY_LABEL_KEY).toEqual({
      available: 'order_availability_available',
      almost_gone: 'order_availability_almost_gone',
      sold_out: 'order_availability_sold_out',
    });
  });
});

describe('isCategoryAvailability', () => {
  it.each([
    ['available', true],
    ['almost_gone', true],
    ['sold_out', true],
    ['paused', false],
    ['SOLD_OUT', false],
    ['toString', false],
    ['__proto__', false],
    ['constructor', false],
    ['', false],
    [undefined, false],
    [null, false],
    [0, false],
    [1, false],
  ])('%s → %s', (value, expected) => {
    expect(isCategoryAvailability(value)).toBe(expected);
  });
});
