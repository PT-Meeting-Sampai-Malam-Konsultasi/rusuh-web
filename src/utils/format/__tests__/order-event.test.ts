import { describe, expect, it } from 'vitest';

import type { Category } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';

import { posterToneFor } from '../event-card';
import { toOrderCategoryView, toOrderEventView } from '../order-event';

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
  it('keeps only id, name and description', () => {
    const category: Category = {
      categoryId: 'cat_festival',
      name: 'Festival',
      description: 'Berdiri, dekat panggung',
      seating: 'standing',
      entryGate: 'A',
      price: { amount: 450000, currency: 'IDR' },
      availability: 'available',
      available: 120,
    };
    expect(toOrderCategoryView(category)).toEqual({
      id: 'cat_festival',
      name: 'Festival',
      description: 'Berdiri, dekat panggung',
    });
  });
});
