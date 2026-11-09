import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { OrderCategoriesResult } from '@core/use_case/booking/get-order-categories.use-case';
import { retryTransientOnce } from '@utils/query/retry';

import OrderController from '../order.controller';

const event: EventSummary = {
  eventId: 'evt_samudra',
  name: 'Samudra',
  subtitle: 'Tur Gelombang 2026',
  venue: 'Stadion Utama GBK',
  city: 'Jakarta',
  timezone: 'Asia/Jakarta',
  startsAt: '2026-12-12T12:00:00Z',
  state: 'on_sale',
};

const festival: Category = {
  categoryId: 'cat_festival',
  name: 'Festival',
  description: 'Berdiri',
  seating: 'standing',
  price: { amount: 450000, currency: 'IDR' },
  availability: 'available',
};
const tribune: Category = { ...festival, categoryId: 'cat_tribune', name: 'Tribun', description: undefined };

const okResult: OrderCategoriesResult = {
  kind: 'ok',
  categories: [festival, tribune],
  maxTicketsPerOrder: 3,
  reservedUnits: 3,
  adminFee: { amount: 5000, currency: 'IDR' },
  expiresAt: '2026-11-09T03:05:00Z',
  serverNow: '2026-11-09T03:00:00Z',
};

type Err = { status: number; code: string; message: string };
interface QueryState {
  data?: unknown;
  isError?: boolean;
  error?: Err | null;
}

const err = (status: number, code: string): QueryState => ({ isError: true, error: { status, code, message: 'raw' } });

describe('OrderController', () => {
  let eventOptions: Record<string, unknown>;
  let categoriesOptions: Record<string, unknown>;
  let eventState: QueryState;
  let categoriesState: QueryState;
  let search: Record<string, string>;
  const eventRefetch = vi.fn();
  const categoriesRefetch = vi.fn();
  const replace = vi.fn();
  const router = { replace, push: vi.fn() };
  const changeLanguage = vi.fn();
  const i18n = { language: 'id', changeLanguage };
  const t = vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  );

  const deps = () => ({
    catalogService: { listEvents: vi.fn(), getEvent: vi.fn().mockResolvedValue({ data: event, status: 200 }) },
    getOrderCategoriesUseCase: { execute: vi.fn().mockResolvedValue(okResult) },
    admissionStore: { get: vi.fn().mockReturnValue('adm_token'), set: vi.fn(), clear: vi.fn() },
    analyticsAdapter: { trackPageView: vi.fn(), trackEvent: vi.fn(), reportError: vi.fn() },
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    ERROR_CODE_MAP: {
      NETWORK_ERROR: 'error_network_error',
      UNAUTHORIZED: 'error_unauthorized',
      INTERNAL_ERROR: 'error_internal_error',
      UNKNOWN_ERROR: 'error_unknown_error',
    },
    useTranslation: () => ({ t, i18n }),
    useRouterNext: () => router,
    useSearchParamsNext: () => ({ get: (key: string) => search[key] ?? null }),
    useQueryTanstack: (options: { queryKey: unknown[] } & Record<string, unknown>) => {
      if (options.queryKey[0] === 'event') {
        eventOptions = options;
        return { data: undefined, isError: false, error: null, refetch: eventRefetch, ...eventState };
      }
      categoriesOptions = options;
      return { data: undefined, isError: false, error: null, refetch: categoriesRefetch, ...categoriesState };
    },
  });

  const render = (d = deps()) => renderHook(() => OrderController(d as never));

  beforeEach(() => {
    vi.clearAllMocks();
    eventState = {};
    categoriesState = {};
    search = { event: 'evt_samudra' };
    i18n.language = 'id';
  });

  describe('queries', () => {
    it('loads the event through the catalog service', async () => {
      const d = deps();
      const { result } = render(d);
      expect(result.current.status).toBe('loading');
      expect(eventOptions).toMatchObject({
        queryKey: ['event', 'evt_samudra'],
        enabled: true,
        staleTime: 60000,
        retry: retryTransientOnce,
      });
      await expect((eventOptions.queryFn as () => Promise<unknown>)()).resolves.toEqual(event);
      expect(d.catalogService.getEvent).toHaveBeenCalledWith('evt_samudra');
    });

    it('loads the categories through the use case with the token read at fetch time', async () => {
      const d = deps();
      render(d);
      expect(categoriesOptions).toMatchObject({
        queryKey: ['categories', 'evt_samudra', 'id'],
        enabled: true,
        gcTime: 0,
        retry: retryTransientOnce,
      });
      expect(categoriesOptions).not.toHaveProperty('refetchInterval');
      expect(JSON.stringify(categoriesOptions.queryKey)).not.toContain('adm_token');
      expect(d.admissionStore.get).not.toHaveBeenCalled();
      await expect((categoriesOptions.queryFn as () => Promise<unknown>)()).resolves.toEqual(okResult);
      expect(d.admissionStore.get).toHaveBeenCalledWith('evt_samudra');
      expect(d.getOrderCategoriesUseCase.execute).toHaveBeenCalledWith({
        eventId: 'evt_samudra',
        admissionToken: 'adm_token',
      });
    });

    it('keeps the previous categories while a new language loads', () => {
      i18n.language = 'en';
      render();
      expect(categoriesOptions.queryKey).toEqual(['categories', 'evt_samudra', 'en']);
      const placeholder = categoriesOptions.placeholderData as (previous: unknown) => unknown;
      expect(placeholder(okResult)).toBe(okResult);
    });

    it('trims the event id', () => {
      search = { event: '  evt_samudra ' };
      render();
      expect(eventOptions.queryKey).toEqual(['event', 'evt_samudra']);
    });
  });

  describe('status', () => {
    it.each([{}, { event: '' }, { event: '   ' }])('is not-found and runs no query without an event id (%o)', (s) => {
      search = s as Record<string, string>;
      const { result } = render();
      expect(result.current.status).toBe('not-found');
      expect(eventOptions.enabled).toBe(false);
      expect(categoriesOptions.enabled).toBe(false);
      expect(result.current.backHref).toBe('/');
      expect(result.current.event).toBeNull();
    });

    it('is not-found when the event does not exist, and does not redirect', () => {
      eventState = err(404, 'NOT_FOUND');
      categoriesState = { data: { kind: 'admission-invalid' } };
      const { result } = render();
      expect(result.current.status).toBe('not-found');
      expect(result.current.errorMessage).toBe('');
      expect(replace).not.toHaveBeenCalled();
    });

    it('treats a 404 with another code as not-found', () => {
      eventState = err(404, 'HTTP_404');
      expect(render().result.current.status).toBe('not-found');
    });

    it('stays loading while only the event has loaded', () => {
      eventState = { data: event };
      const { result } = render();
      expect(result.current.status).toBe('loading');
      expect(result.current.event?.name).toBe('Samudra');
      expect(result.current.categories).toEqual([]);
      expect(result.current.categoryNote).toBe('');
    });

    it('stays loading while only the categories have loaded', () => {
      categoriesState = { data: okResult };
      expect(render().result.current.status).toBe('loading');
    });

    it('is ready with formatted views', () => {
      eventState = { data: event };
      categoriesState = { data: okResult };
      const { result } = render();
      expect(result.current.status).toBe('ready');
      expect(result.current.event).toMatchObject({
        id: 'evt_samudra',
        name: 'Samudra',
        subtitle: 'Tur Gelombang 2026',
        metaLine: 'Sab, 12 Des 2026 · 19.00 WIB · Stadion Utama GBK, Jakarta',
      });
      expect(result.current.categories).toEqual([
        { id: 'cat_festival', name: 'Festival', description: 'Berdiri' },
        { id: 'cat_tribune', name: 'Tribun', description: undefined },
      ]);
      expect(result.current.categoryNote).toBe('order_category_note:{"count":3}');
      expect(result.current.errorMessage).toBe('');
    });
  });

  describe('errors', () => {
    it('maps a network error on the event and retries only the failed query', () => {
      eventState = err(0, 'NETWORK_ERROR');
      const { result } = render();
      expect(result.current.status).toBe('error');
      expect(result.current.errorMessage).toBe('error_network_error');
      result.current.retry();
      expect(eventRefetch).toHaveBeenCalledTimes(1);
      expect(categoriesRefetch).not.toHaveBeenCalled();
    });

    it('shows the unauthorized text inline on a 401 from the categories (no sign-in redirect yet)', () => {
      eventState = { data: event };
      categoriesState = err(401, 'UNAUTHORIZED');
      const { result } = render();
      expect(result.current.status).toBe('error');
      expect(result.current.errorMessage).toBe('error_unauthorized');
      expect(replace).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
      result.current.retry();
      expect(categoriesRefetch).toHaveBeenCalledTimes(1);
      expect(eventRefetch).not.toHaveBeenCalled();
    });

    it('prefers the event error and retries both failed queries', () => {
      eventState = err(500, 'INTERNAL_ERROR');
      categoriesState = err(0, 'NETWORK_ERROR');
      const { result } = render();
      expect(result.current.errorMessage).toBe('error_internal_error');
      result.current.retry();
      expect(eventRefetch).toHaveBeenCalledTimes(1);
      expect(categoriesRefetch).toHaveBeenCalledTimes(1);
    });

    it('falls back to the generic message for an unmapped code, never the raw message', () => {
      eventState = { data: event };
      categoriesState = err(403, 'FORBIDDEN_THING');
      const { result } = render();
      expect(result.current.errorMessage).toBe('error_unknown_error');
      expect(result.current.errorMessage).not.toContain('raw');
    });
  });

  describe('admission redirect', () => {
    it('sends the buyer back to the waiting room once the event has loaded', () => {
      eventState = { data: event };
      categoriesState = { data: { kind: 'admission-invalid' } };
      const { result, rerender } = render();
      expect(result.current.status).toBe('loading');
      rerender();
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith('/queue?event=evt_samudra');
    });

    it('encodes the event id', () => {
      search = { event: 'evt a&b' };
      eventState = { data: event };
      categoriesState = { data: { kind: 'admission-invalid' } };
      render();
      expect(replace).toHaveBeenCalledWith('/queue?event=evt+a%26b');
    });

    it('waits for the event before redirecting', () => {
      categoriesState = { data: { kind: 'admission-invalid' } };
      expect(render().result.current.status).toBe('loading');
      expect(replace).not.toHaveBeenCalled();
    });
  });

  describe('chrome', () => {
    it('builds the flow steps with step 1 current and the links', () => {
      const { result } = render();
      expect(result.current.steps).toEqual([
        { number: 1, label: 'order_step_choose', current: true },
        { number: 2, label: 'order_step_pay', current: false },
        { number: 3, label: 'order_step_ticket', current: false },
      ]);
      expect(result.current.backHref).toBe('/queue?event=evt_samudra');
      expect(result.current.homeHref).toBe('/');
      expect(result.current.t).toBe(t);
    });

    it('switches and saves the language', () => {
      const d = deps();
      const { result } = render(d);
      expect(result.current.locale).toBe('id');
      result.current.setLocale('en');
      expect(d.storage.set).toHaveBeenCalledWith('rusuh.lang', 'en');
      expect(changeLanguage).toHaveBeenCalledWith('en');
      i18n.language = 'en';
      expect(render().result.current.locale).toBe('en');
    });

    it('tracks the order page view once per mount, whatever the status', () => {
      const d = deps();
      const { rerender } = render(d);
      rerender();
      expect(d.analyticsAdapter.trackPageView).toHaveBeenCalledTimes(1);
      expect(d.analyticsAdapter.trackPageView).toHaveBeenCalledWith('order');
      search = {};
      const other = deps();
      render(other);
      expect(other.analyticsAdapter.trackPageView).toHaveBeenCalledWith('order');
    });
  });
});
