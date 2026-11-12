import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TicketsController from '../tickets.controller';

interface QueryState {
  data?: unknown;
  isError?: boolean;
  error?: { status: number; code: string; message: string } | null;
}

const money = (amount: number) => ({ amount, currency: 'IDR' as const });
const order = (bookingId: string, tickets: number, startsAt = '2026-12-12T12:00:00Z') => ({
  booking: {
    bookingId,
    eventId: 'evt_samudra',
    status: 'PAID',
    orderCode: `RSH-${bookingId}`,
    price: { lines: [], ticketSubtotal: money(0), adminFee: money(0), total: money(100000) },
    createdAt: '2026-11-12T03:00:00Z',
    serverNow: '2026-11-12T03:00:00Z',
  },
  event: { eventId: 'evt_samudra', name: 'Samudra', venue: 'GBK', startsAt, state: 'on_sale' },
  tickets: Array.from({ length: tickets }, (_, i) => ({
    ticketId: `${bookingId}_${i}`,
    bookingId,
    categoryName: 'Festival B',
    holderName: 'Nadia',
    nikMasked: 'x',
    qrPayload: 'q',
  })),
});

describe('TicketsController', () => {
  let queryOptions: Record<string, unknown>;
  let queryState: QueryState;
  const refetch = vi.fn();
  const changeLanguage = vi.fn();
  const i18n = { language: 'id', changeLanguage };
  const t = vi.fn((key: string, options?: { count?: number }) =>
    options?.count !== undefined ? `${key}:${options.count}` : key,
  );

  const deps = () => ({
    getMyOrdersUseCase: { execute: vi.fn().mockResolvedValue({ upcoming: [], past: [], serverNow: null }) },
    analyticsAdapter: { trackPageView: vi.fn(), trackEvent: vi.fn(), reportError: vi.fn() },
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    ERROR_CODE_MAP: { INTERNAL_ERROR: 'error_internal', UNKNOWN_ERROR: 'error_unknown_error' },
    useTranslation: () => ({ t, i18n }),
    useQueryTanstack: (options: Record<string, unknown>) => {
      queryOptions = options;
      return { data: undefined, isError: false, error: null, refetch, ...queryState };
    },
  });
  const render = (d = deps()) => renderHook(() => TicketsController(d as never));

  beforeEach(() => {
    vi.clearAllMocks();
    queryState = {};
    i18n.language = 'id';
  });

  it('loads my orders once, and tracks the page', async () => {
    const d = deps();
    const { result } = render(d);
    expect(result.current.status).toBe('loading');
    expect(result.current.groups).toEqual([]);
    expect(queryOptions).toMatchObject({ queryKey: ['my-orders'], retry: false });
    await (queryOptions.queryFn as () => Promise<unknown>)();
    expect(d.getMyOrdersUseCase.execute).toHaveBeenCalled();
    expect(d.analyticsAdapter.trackPageView).toHaveBeenCalledWith('tickets');
    expect(result.current.nav.find((item) => item.current)?.icon).toBe('tickets');
    expect(result.current.signInHref).toBe('/login?next=%2Ftickets');
  });

  it('groups upcoming and past orders with their counts', () => {
    queryState = {
      data: {
        upcoming: [order('a', 2), order('b', 3)],
        past: [order('c', 1, '2026-10-01T12:00:00Z')],
        serverNow: '2026-11-12T03:00:00Z',
      },
    };
    const { result } = render();
    expect(result.current.status).toBe('ready');
    expect(result.current.groups.map((g) => [g.id, g.title, g.summary, g.orders.length])).toEqual([
      ['upcoming', 'tickets_upcoming', 'tickets_orders_count:2 · tickets_count:5', 2],
      ['past', 'tickets_past', 'tickets_orders_count:1', 1],
    ]);
    expect(result.current.groups[1].orders[0].past).toBe(true);
    expect(result.current.groups[0].orders[0].daysLeft).toBe('tickets_days_left:30');
  });

  it('shows only the groups that have orders, and empty when none do', () => {
    queryState = { data: { upcoming: [], past: [order('c', 1)], serverNow: null } };
    expect(render().result.current.groups.map((g) => g.id)).toEqual(['past']);
    queryState = { data: { upcoming: [], past: [], serverNow: null } };
    expect(render().result.current.status).toBe('empty');
  });

  it('asks a signed-out visitor to sign in, and shows other failures with a retry', () => {
    queryState = { isError: true, error: { status: 401, code: 'UNAUTHORIZED', message: 'x' } };
    expect(render().result.current).toMatchObject({ status: 'signed-out', errorMessage: '' });

    queryState = { isError: true, error: { status: 503, code: 'INTERNAL_ERROR', message: 'x' } };
    const { result } = render();
    expect(result.current).toMatchObject({ status: 'error', errorMessage: 'error_internal' });
    result.current.retry();
    expect(refetch).toHaveBeenCalled();

    queryState = { isError: true, error: { status: 0, code: 'SOMETHING', message: 'x' } };
    expect(render().result.current.errorMessage).toBe('error_unknown_error');
  });

  it('switches language and remembers it', () => {
    const d = deps();
    i18n.language = 'en';
    const { result } = render(d);
    expect(result.current.locale).toBe('en');
    result.current.setLocale('id');
    expect(d.storage.set).toHaveBeenCalledWith('rusuh.lang', 'id');
    expect(changeLanguage).toHaveBeenCalledWith('id');
  });
});
