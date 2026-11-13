import { describe, expect, it } from 'vitest';

import type { Category } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';

import {
  ANALYTICS_EVENTS,
  categoryItem,
  eventItem,
  positionBucket,
  priceItems,
  signInFrom,
  waitBucket,
} from '../analytics';

describe('analytics helpers (tracking plan)', () => {
  it('names the events as the plan does: snake_case, at most 40 characters, no duplicates', () => {
    const names = Object.values(ANALYTICS_EVENTS);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z_]{0,39}$/);
  });

  it('turns positions and waits into the plan ranges', () => {
    expect([1, 100, 101, 1000, 1001, 10000, 10001].map(positionBucket)).toEqual([
      '1-100',
      '1-100',
      '101-1000',
      '101-1000',
      '1001-10000',
      '1001-10000',
      '10000+',
    ]);
    expect([0, 60, 61, 300, 301, 900, 901].map(waitBucket)).toEqual([
      '0-60',
      '0-60',
      '61-300',
      '61-300',
      '301-900',
      '301-900',
      '900+',
    ]);
  });

  it('builds an event item, with format, price and index only when known', () => {
    const event = { eventId: 'evt_2026_wbh', name: 'Way Back Home', venue: 'X', startsAt: 'x', state: 'on_sale' };
    expect(eventItem(event as EventSummary)).toEqual({ item_id: 'evt_2026_wbh', item_name: 'Way Back Home' });
    expect(
      eventItem({ ...event, format: 'Konser', priceFrom: { amount: 350000, currency: 'IDR' } } as EventSummary, 2),
    ).toEqual({
      item_id: 'evt_2026_wbh',
      item_name: 'Way Back Home',
      item_category: 'Konser',
      price: 350000,
      index: 2,
    });
  });

  it('builds a category item with the event as category and brand, and the quantity when given', () => {
    const category = {
      categoryId: 'cat_fb',
      name: 'Festival B',
      price: { amount: 850000, currency: 'IDR' },
    } as Category;
    const event = { eventId: 'evt_2026_wbh', name: 'Way Back Home' };
    expect(categoryItem(category, event)).toEqual({
      item_id: 'cat_fb',
      item_name: 'Festival B',
      item_category: 'evt_2026_wbh',
      item_brand: 'Way Back Home',
      price: 850000,
    });
    expect(categoryItem(category, event, 2).quantity).toBe(2);
  });

  it('names where sign-in started from the return path', () => {
    expect(signInFrom('/queue?event=evt_2026_wbh')).toBe('queue');
    expect(signInFrom('/order?event=evt_2026_wbh')).toBe('order');
    expect(signInFrom('/account')).toBe('account');
    expect(signInFrom('/tickets')).toBe('tickets');
    expect(signInFrom('/tickets/detail?booking=bk_1')).toBe('tickets');
    expect(signInFrom('/')).toBe('other');
  });

  it('builds one item per price line with the unit price and quantity', () => {
    const money = (amount: number) => ({ amount, currency: 'IDR' as const });
    expect(
      priceItems({
        lines: [
          {
            categoryId: 'cat_fb',
            name: 'Festival B',
            quantity: 2,
            unitPrice: money(850000),
            lineTotal: money(1700000),
          },
          {
            categoryId: 'cat_ta',
            name: 'Tribun Atas',
            quantity: 1,
            unitPrice: money(450000),
            lineTotal: money(450000),
          },
        ],
        ticketSubtotal: money(2150000),
        adminFee: money(10000),
        total: money(2160000),
      }),
    ).toEqual([
      { item_id: 'cat_fb', item_name: 'Festival B', price: 850000, quantity: 2 },
      { item_id: 'cat_ta', item_name: 'Tribun Atas', price: 450000, quantity: 1 },
    ]);
  });
});
