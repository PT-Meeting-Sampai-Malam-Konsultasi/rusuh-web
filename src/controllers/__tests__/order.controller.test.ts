import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { OrderCategoriesResult } from '@core/use_case/booking/get-order-categories.use-case';
import { OrderTicketSelectionUseCase } from '@core/use_case/booking/order-ticket-selection.use-case';
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
const tribune: Category = {
  ...festival,
  categoryId: 'cat_tribune',
  name: 'Tribun',
  description: undefined,
  price: { amount: 1250000, currency: 'IDR' },
  availability: 'sold_out',
  available: 0,
};

const okResult: OrderCategoriesResult = {
  kind: 'ok',
  categories: [festival, tribune],
  maxTicketsPerOrder: 3,
  reservedUnits: 3,
  adminFee: { amount: 5000, currency: 'IDR' },
  expiresAt: '2026-11-09T03:05:00Z',
  serverNow: '2026-11-09T03:00:00Z',
};

/** Tribun with stock left: the stepper and holder tests pick from two open categories. */
const tribuneOpen: Category = {
  categoryId: 'cat_tribune',
  name: 'Tribun',
  seating: 'seated',
  price: { amount: 1250000, currency: 'IDR' },
  availability: 'available',
};
const openResult: OrderCategoriesResult = { ...okResult, categories: [festival, tribuneOpen] };

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
  let meOptions: Record<string, unknown>;
  let eventState: QueryState;
  let categoriesState: QueryState;
  let meState: QueryState;
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
    accountService: {
      getMe: vi.fn().mockResolvedValue({ data: { userId: 'usr_1', email: 'nadia@example.com' }, status: 200 }),
      updateProfile: vi.fn(),
    },
    getOrderCategoriesUseCase: { execute: vi.fn().mockResolvedValue(okResult) },
    orderTicketSelectionUseCase: OrderTicketSelectionUseCase(),
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
      if (options.queryKey[0] === 'me') {
        meOptions = options;
        return { data: undefined, isError: false, error: null, refetch: vi.fn(), ...meState };
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
    meState = {};
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
        {
          id: 'cat_festival',
          name: 'Festival',
          description: 'Berdiri',
          price: 'Rp 450.000',
          availability: 'available',
          availabilityLabel: 'order_availability_available',
          soldOut: false,
          quantity: 0,
          selected: false,
          canIncrement: true,
          canDecrement: false,
          incrementLabel: 'order_stepper_increase:{"category":"Festival"}',
          decrementLabel: 'order_stepper_decrease:{"category":"Festival"}',
        },
        {
          id: 'cat_tribune',
          name: 'Tribun',
          description: undefined,
          price: 'Rp 1.250.000',
          availability: 'sold_out',
          availabilityLabel: 'order_availability_sold_out',
          soldOut: true,
          quantity: 0,
          selected: false,
          canIncrement: false,
          canDecrement: false,
          incrementLabel: 'order_stepper_increase:{"category":"Tribun"}',
          decrementLabel: 'order_stepper_decrease:{"category":"Tribun"}',
        },
      ]);
      expect(result.current.categories[1]).not.toHaveProperty('available');
      expect(result.current.categoryNote).toBe('order_category_note:{"count":3}');
      expect(result.current.errorMessage).toBe('');
    });
  });

  describe('category views', () => {
    it('reformats prices and retranslates labels on a language change without a refetch', () => {
      eventState = { data: event };
      categoriesState = { data: okResult };
      const translations: Record<string, Record<string, string>> = {
        id: { order_availability_available: 'Tersedia', order_availability_sold_out: 'Habis' },
        en: { order_availability_available: 'Available', order_availability_sold_out: 'Sold out' },
      };
      const tFor = (language: string) => (key: string) => translations[language][key] ?? key;
      let current = { t: tFor('id'), i18n: { language: 'id', changeLanguage } };
      const d = { ...deps(), useTranslation: () => current };
      const { result, rerender } = renderHook(() => OrderController(d as never));
      expect(result.current.categories.map((c) => [c.price, c.availabilityLabel])).toEqual([
        ['Rp 450.000', 'Tersedia'],
        ['Rp 1.250.000', 'Habis'],
      ]);

      current = { t: tFor('en'), i18n: { language: 'en', changeLanguage } };
      rerender();
      expect(result.current.categories.map((c) => [c.price, c.availabilityLabel])).toEqual([
        ['Rp 450,000', 'Available'],
        ['Rp 1,250,000', 'Sold out'],
      ]);
      expect(categoriesRefetch).not.toHaveBeenCalled();
      expect(categoriesOptions).not.toHaveProperty('refetchInterval');
    });

    it('keeps the same views while the result, locale and t do not change', () => {
      eventState = { data: event };
      categoriesState = { data: okResult };
      const { result, rerender } = render();
      const first = result.current.categories;
      rerender();
      expect(result.current.categories).toBe(first);
    });

    it('shows no label for an unknown availability', () => {
      eventState = { data: event };
      categoriesState = {
        data: { ...okResult, categories: [{ ...festival, availability: 'paused' as never }] },
      };
      const { result } = render();
      expect(result.current.categories[0]).toMatchObject({
        price: 'Rp 450.000',
        availability: null,
        availabilityLabel: '',
        soldOut: false,
      });
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
  describe('steppers', () => {
    const ready = () => {
      eventState = { data: event };
      categoriesState = { data: openResult };
    };

    it('starts every quantity at 0 with the limit from the use case', () => {
      ready();
      const { result } = render();
      expect(result.current.categories.map((c) => c.quantity)).toEqual([0, 0]);
      expect(result.current.totalTickets).toBe(0);
      expect(result.current.orderLimit).toBe(3);
      expect(result.current.showHolders).toBe(false);
      expect(result.current.holders).toEqual([]);
    });

    it('has a limit of 0 and no rows before the categories load', () => {
      const { result } = render();
      expect(result.current.orderLimit).toBe(0);
      expect(result.current.categories).toEqual([]);
      act(() => result.current.increment('cat_festival'));
      expect(result.current.totalTickets).toBe(0);
    });

    it('adds and removes tickets per category and marks the row selected', () => {
      ready();
      const { result } = render();
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.increment('cat_festival'));
      expect(result.current.categories[0]).toMatchObject({
        quantity: 2,
        selected: true,
        canIncrement: true,
        canDecrement: true,
      });
      expect(result.current.categories[1]).toMatchObject({ quantity: 0, selected: false, canDecrement: false });
      expect(result.current.totalTickets).toBe(2);
      act(() => result.current.decrement('cat_festival'));
      expect(result.current.categories[0].quantity).toBe(1);
      expect(result.current.totalTickets).toBe(1);
    });

    it('disables both buttons on a sold-out category at 0 (FR-14-W1)', () => {
      eventState = { data: event };
      categoriesState = { data: okResult };
      const { result } = render();
      expect(result.current.categories[1]).toMatchObject({ soldOut: true, canIncrement: false, canDecrement: false });
      const before = result.current.categories;
      act(() => result.current.increment('cat_tribune'));
      expect(result.current.categories).toBe(before);
      expect(result.current.totalTickets).toBe(0);
    });

    it('stops at the limit across categories', () => {
      ready();
      const { result } = render();
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.increment('cat_tribune'));
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.increment('cat_tribune'));
      expect(result.current.totalTickets).toBe(3);
      expect(result.current.categories.every((c) => !c.canIncrement)).toBe(true);
    });

    it('caps the limit at the reserved units', () => {
      eventState = { data: event };
      categoriesState = { data: { ...openResult, maxTicketsPerOrder: 3, reservedUnits: 2 } };
      const { result } = render();
      expect(result.current.orderLimit).toBe(2);
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.increment('cat_tribune'));
      expect(result.current.categories.map((c) => c.canIncrement)).toEqual([false, false]);
      act(() => result.current.increment('cat_festival'));
      expect(result.current.totalTickets).toBe(2);
      expect(result.current.categoryNote).toBe('order_category_note:{"count":2}');
    });

    it('ignores a decrement at 0 and an unknown category', () => {
      ready();
      const { result } = render();
      const before = result.current.categories;
      act(() => result.current.decrement('cat_festival'));
      act(() => result.current.increment('cat_nope'));
      expect(result.current.categories).toBe(before);
      expect(result.current.totalTickets).toBe(0);
    });

    it('delegates to the use case and changes nothing on an unchanged result', () => {
      ready();
      const real = OrderTicketSelectionUseCase();
      const useCase = {
        ...real,
        orderLimit: vi.fn(real.orderLimit),
        summarize: vi.fn(real.summarize),
        increment: vi.fn(() => ({ kind: 'unchanged' as const, reason: 'LIMIT_REACHED' as const })),
        decrement: vi.fn(() => ({ kind: 'unchanged' as const, reason: 'NONE_TO_REMOVE' as const })),
        reconcileHolders: vi.fn(real.reconcileHolders),
      };
      const d = { ...deps(), orderTicketSelectionUseCase: useCase };
      const { result } = render(d);
      expect(useCase.orderLimit).toHaveBeenCalledWith(openResult);
      expect(useCase.summarize).toHaveBeenCalledWith(openResult.categories, {}, 3);
      const before = result.current.categories;
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.decrement('cat_festival'));
      expect(useCase.increment).toHaveBeenCalledWith(openResult.categories, {}, 'cat_festival', 3);
      expect(useCase.decrement).toHaveBeenCalledWith(openResult.categories, {}, 'cat_festival');
      expect(useCase.reconcileHolders).not.toHaveBeenCalled();
      expect(result.current.categories).toBe(before);
      expect(result.current.holders).toEqual([]);
    });

    it('keeps the quantities and retranslates the labels on a language change', () => {
      ready();
      const tFor = (language: string) => (key: string, params?: Record<string, unknown>) =>
        `${language}:${key}:${String(params?.category ?? '')}`;
      let current = { t: tFor('id'), i18n: { language: 'id', changeLanguage } };
      const d = { ...deps(), useTranslation: () => current };
      const { result, rerender } = renderHook(() => OrderController(d as never));
      act(() => result.current.increment('cat_festival'));
      expect(result.current.categories[0].incrementLabel).toBe('id:order_stepper_increase:Festival');
      current = { t: tFor('en'), i18n: { language: 'en', changeLanguage } };
      rerender();
      expect(result.current.categories[0]).toMatchObject({
        quantity: 1,
        incrementLabel: 'en:order_stepper_increase:Festival',
        decrementLabel: 'en:order_stepper_decrease:Festival',
      });
      expect(result.current.holders[0].title).toBe('en:order_holder_title:Festival');
    });
  });

  describe('stepper limits', () => {
    const soldOut: Category = {
      ...tribuneOpen,
      categoryId: 'cat_vip',
      name: 'VIP',
      availability: 'sold_out',
      available: 0,
    };
    const lastOne: Category = { ...tribuneOpen, availability: 'almost_gone', available: 1 };
    const withCategories = (categories: Category[], extra: Partial<OrderCategoriesResult> = {}) => {
      eventState = { data: event };
      categoriesState = { data: { ...okResult, categories, ...extra } };
    };

    it('leaves everything unchanged on a sold-out row and tracks nothing', () => {
      withCategories([festival, soldOut]);
      const d = deps();
      const { result } = render(d);
      act(() => result.current.increment('cat_festival'));
      expect(result.current.categories[1]).toMatchObject({ quantity: 0, canIncrement: false, canDecrement: false });
      const rows = result.current.categories;
      const holders = result.current.holders;
      act(() => result.current.increment('cat_vip'));
      expect(result.current.totalTickets).toBe(1);
      expect(result.current.categories).toBe(rows);
      expect(result.current.holders).toBe(holders);
      expect(result.current.limitNotice).toBeNull();
      expect(d.analyticsAdapter.trackEvent).not.toHaveBeenCalled();
    });

    it('stops a row at its snapshot stock while the others stay open', () => {
      withCategories([festival, lastOne]);
      const { result } = render();
      act(() => result.current.increment('cat_tribune'));
      expect(result.current.totalTickets).toBe(1);
      expect(result.current.categories.map((c) => c.canIncrement)).toEqual([true, false]);
      act(() => result.current.increment('cat_tribune'));
      expect(result.current.categories[1].quantity).toBe(1);
      expect(result.current.limitNotice).toBeNull();
    });

    it('keeps a stale pick removable after a refetch reports it sold out', () => {
      withCategories([festival, tribuneOpen]);
      const { result, rerender } = render();
      act(() => result.current.increment('cat_tribune'));
      act(() => result.current.increment('cat_tribune'));
      categoriesState = {
        data: { ...okResult, categories: [festival, { ...tribuneOpen, availability: 'sold_out', available: 0 }] },
      };
      rerender();
      expect(result.current.categories[1]).toMatchObject({ quantity: 2, canIncrement: false, canDecrement: true });
      act(() => result.current.decrement('cat_tribune'));
      expect(result.current.categories[1]).toMatchObject({ quantity: 1, canIncrement: false, canDecrement: true });
      expect(result.current.holders).toHaveLength(1);
    });

    it('shows no notice below the limit and the HiFi line at 3', () => {
      withCategories([festival, tribuneOpen]);
      const d = deps();
      const { result } = render(d);
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.increment('cat_festival'));
      expect(result.current.limitNotice).toBeNull();
      act(() => result.current.increment('cat_tribune'));
      expect(result.current.limitNotice).toEqual({ count: '3/3', message: 'order_limit_reached:{"count":3}' });
      act(() => result.current.increment('cat_festival'));
      expect(result.current.totalTickets).toBe(3);
      expect(d.analyticsAdapter.trackEvent).not.toHaveBeenCalled();
      expect(d.analyticsAdapter.trackPageView.mock.calls).toEqual([['order']]);
      act(() => result.current.decrement('cat_tribune'));
      expect(result.current.limitNotice).toBeNull();
    });

    it.each([
      [2, '2/2'],
      [1, '1/1'],
    ])('uses the reservation line when the turn holds %i', (reservedUnits, count) => {
      withCategories([festival, tribuneOpen], { reservedUnits });
      const { result } = render();
      for (let i = 0; i < reservedUnits; i += 1) act(() => result.current.increment('cat_festival'));
      expect(result.current.limitNotice).toEqual({
        count,
        message: `order_limit_reached_reserved:{"count":${reservedUnits}}`,
      });
      expect(result.current.categoryNote).toBe(`order_category_note:{"count":${reservedUnits}}`);
    });

    it('shows no notice when the limit is 0', () => {
      withCategories([festival, tribuneOpen], { reservedUnits: 0 });
      const { result } = render();
      expect(result.current.orderLimit).toBe(0);
      act(() => result.current.increment('cat_festival'));
      expect(result.current.totalTickets).toBe(0);
      expect(result.current.limitNotice).toBeNull();
    });

    it('shows no notice unless the page is ready', () => {
      withCategories([festival, tribuneOpen], { reservedUnits: 1 });
      const { result, rerender } = render();
      act(() => result.current.increment('cat_festival'));
      expect(result.current.limitNotice).not.toBeNull();
      eventState = err(0, 'NETWORK_ERROR');
      rerender();
      expect(result.current.status).toBe('error');
      expect(result.current.limitNotice).toBeNull();
      eventState = {};
      rerender();
      expect(result.current.status).toBe('loading');
      expect(result.current.limitNotice).toBeNull();
    });

    it('keeps the quantities and retranslates the notice on a language change', () => {
      withCategories([festival, tribuneOpen], { reservedUnits: 2 });
      const tFor = (language: string) => (key: string, params?: Record<string, unknown>) =>
        `${language}:${key}:${String(params?.count ?? '')}`;
      let current = { t: tFor('id'), i18n: { language: 'id', changeLanguage } };
      const d = { ...deps(), useTranslation: () => current };
      const { result, rerender } = renderHook(() => OrderController(d as never));
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.increment('cat_tribune'));
      expect(result.current.limitNotice).toEqual({ count: '2/2', message: 'id:order_limit_reached_reserved:2' });
      current = { t: tFor('en'), i18n: { language: 'en', changeLanguage } };
      rerender();
      expect(result.current.totalTickets).toBe(2);
      expect(result.current.limitNotice).toEqual({ count: '2/2', message: 'en:order_limit_reached_reserved:2' });
      expect(result.current.categoryNote).toBe('en:order_category_note:2');
    });
  });

  describe('holders', () => {
    const ready = () => {
      eventState = { data: event };
      categoriesState = { data: openResult };
    };

    it('shows one titled holder per ticket in slot order', () => {
      ready();
      const { result } = render();
      act(() => result.current.increment('cat_tribune'));
      act(() => result.current.increment('cat_festival'));
      expect(result.current.showHolders).toBe(true);
      expect(result.current.holders).toHaveLength(2);
      expect(result.current.holders.map((h) => h.title)).toEqual([
        'order_holder_title:{"index":1,"category":"Festival"}',
        'order_holder_title:{"index":2,"category":"Tribun"}',
      ]);
      expect(result.current.holders[0]).toMatchObject({
        key: 'cat_festival-1',
        holderType: 'other',
        choiceName: 'order-holder-cat_festival-1-type',
        selfDisabled: false,
        name: {
          id: 'order-holder-cat_festival-1-name',
          value: '',
          readOnly: false,
          hint: 'order_holder_name_hint',
        },
        nik: { id: 'order-holder-cat_festival-1-nik', value: '' },
      });
    });

    it('hides the holders unless the page is ready', () => {
      ready();
      const { result, rerender } = render();
      act(() => result.current.increment('cat_festival'));
      expect(result.current.showHolders).toBe(true);
      eventState = err(0, 'NETWORK_ERROR');
      rerender();
      expect(result.current.status).toBe('error');
      expect(result.current.showHolders).toBe(false);
    });

    it('keeps typed values with their ticket when other tickets come and go', () => {
      ready();
      const { result } = render();
      act(() => result.current.increment('cat_tribune'));
      act(() => result.current.holders[0].name.onChange('Budi Santoso'));
      act(() => result.current.holders[0].nik.onChange('3174055203960004'));
      act(() => result.current.increment('cat_festival'));
      expect(result.current.holders.map((h) => [h.key, h.name.value])).toEqual([
        ['cat_festival-1', ''],
        ['cat_tribune-1', 'Budi Santoso'],
      ]);
      expect(result.current.holders[1].title).toBe('order_holder_title:{"index":2,"category":"Tribun"}');
      expect(result.current.holders[1].nik.value).toBe('3174 •••• •••• 0004');
      act(() => result.current.decrement('cat_festival'));
      expect(result.current.holders).toHaveLength(1);
      expect(result.current.holders[0]).toMatchObject({
        key: 'cat_tribune-1',
        name: { value: 'Budi Santoso' },
        nik: { value: '3174 •••• •••• 0004' },
      });
    });

    it('starts a re-added ticket empty', () => {
      ready();
      const { result } = render();
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.holders[0].name.onChange('Budi'));
      act(() => result.current.decrement('cat_festival'));
      act(() => result.current.increment('cat_festival'));
      expect(result.current.holders[0].name.value).toBe('');
    });

    it('renders an inert empty holder if a form entry is missing', () => {
      ready();
      const real = OrderTicketSelectionUseCase();
      const d = { ...deps(), orderTicketSelectionUseCase: { ...real, reconcileHolders: () => [] } };
      const { result } = render(d);
      act(() => result.current.increment('cat_festival'));
      const holder = result.current.holders[0];
      expect(holder).toMatchObject({ key: 'cat_festival-1', holderType: 'other', name: { value: '' } });
      act(() => {
        holder.choose('self');
        holder.name.onChange('Budi');
        holder.nik.onChange('3174');
      });
      expect(result.current.holders[0]).toMatchObject({ holderType: 'other', name: { value: '' }, nik: { value: '' } });
    });
  });

  describe('profile', () => {
    const ready = () => {
      eventState = { data: event };
      categoriesState = { data: openResult };
    };
    const withName = (fullName?: string) => {
      meState = { data: { userId: 'usr_1', email: 'nadia@example.com', fullName } };
    };

    it('loads the profile once the page is ready, without retries or focus refetches', async () => {
      const d = deps();
      const { rerender } = render(d);
      expect(meOptions).toMatchObject({ queryKey: ['me'], enabled: false, retry: false, refetchOnWindowFocus: false });
      ready();
      rerender();
      expect(meOptions.enabled).toBe(true);
      await expect((meOptions.queryFn as () => Promise<unknown>)()).resolves.toEqual({
        userId: 'usr_1',
        email: 'nadia@example.com',
      });
      expect(d.accountService.getMe).toHaveBeenCalledTimes(1);
    });

    it('fills "Saya sendiri" from the profile name and blocks it on the other tickets', () => {
      ready();
      withName('  Nadia Saputri ');
      const { result } = render();
      expect(result.current.showHolderChoice).toBe(true);
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.increment('cat_tribune'));
      act(() => result.current.holders[0].choose('self'));
      expect(result.current.holders[0]).toMatchObject({
        holderType: 'self',
        selfDisabled: false,
        name: { value: 'Nadia Saputri', readOnly: true, hint: 'order_holder_name_hint_profile' },
        nik: { value: '' },
      });
      expect(result.current.holders[1].selfDisabled).toBe(true);
      act(() => result.current.holders[1].choose('self'));
      expect(result.current.holders[1].holderType).toBe('other');
      act(() => result.current.holders[0].name.onChange('Someone'));
      expect(result.current.holders[0].name.value).toBe('Nadia Saputri');
      act(() => result.current.holders[0].nik.onChange('3174'));
      expect(result.current.holders[0].nik.value).toBe('3174');

      act(() => result.current.holders[0].choose('other'));
      expect(result.current.holders[0]).toMatchObject({
        holderType: 'other',
        name: { value: '', readOnly: false, hint: 'order_holder_name_hint' },
        nik: { value: '3174' },
      });
      expect(result.current.holders[1].selfDisabled).toBe(false);
    });

    it('ignores choosing the same type again', () => {
      ready();
      withName('Nadia');
      const { result } = render();
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.holders[0].choose('other'));
      expect(result.current.holders[0].holderType).toBe('other');
    });

    it('makes a self holder editable again if the profile disappears', () => {
      ready();
      withName('Nadia');
      const { result, rerender } = render();
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.holders[0].choose('self'));
      meState = err(0, 'NETWORK_ERROR');
      rerender();
      expect(result.current.showHolderChoice).toBe(false);
      expect(result.current.holders[0].name).toMatchObject({ readOnly: false, hint: 'order_holder_name_hint' });
      act(() => result.current.holders[0].name.onChange('Nadia S'));
      expect(result.current.holders[0].name.value).toBe('Nadia S');
    });

    it.each<[string, () => void]>([
      ['401', () => (meState = err(401, 'UNAUTHORIZED'))],
      ['offline', () => (meState = err(0, 'NETWORK_ERROR'))],
      ['server error', () => (meState = err(500, 'INTERNAL_ERROR'))],
      ['pending', () => (meState = {})],
      ['no name', () => withName(undefined)],
      ['a blank name', () => withName('  ')],
    ])('hides the choice silently on %s', (_label, arrange) => {
      ready();
      arrange();
      const d = deps();
      const { result } = render(d);
      expect(result.current.showHolderChoice).toBe(false);
      expect(result.current.status).toBe('ready');
      expect(result.current.errorMessage).toBe('');
      expect(replace).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.holders[0].choose('self'));
      expect(result.current.holders[0].holderType).toBe('other');
      act(() => result.current.holders[0].name.onChange('Budi'));
      expect(result.current.holders[0].name).toMatchObject({ value: 'Budi', readOnly: false });
    });
  });

  describe('NIK', () => {
    it('keeps digits only, shows them while focused and masks them otherwise', () => {
      eventState = { data: event };
      categoriesState = { data: okResult };
      meState = { data: { userId: 'usr_1', email: 'nadia@example.com', fullName: 'Nadia Saputri' } };
      const d = deps();
      const { result } = render(d);
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.holders[0].nik.onFocus());
      act(() => result.current.holders[0].nik.onChange('3174 0552-0396 0004'));
      act(() => result.current.holders[0].name.onChange('Budi Santoso'));
      expect(result.current.holders[0].nik.value).toBe('3174055203960004');
      act(() => result.current.holders[1].nik.onBlur());
      expect(result.current.holders[0].nik.value).toBe('3174055203960004');
      act(() => result.current.holders[0].nik.onBlur());
      expect(result.current.holders[0].nik.value).toBe('3174 •••• •••• 0004');
      act(() => result.current.holders[1].choose('self'));

      const calls = JSON.stringify([
        d.analyticsAdapter.trackEvent.mock.calls,
        d.analyticsAdapter.reportError.mock.calls,
        d.analyticsAdapter.trackPageView.mock.calls,
        d.storage.set.mock.calls,
        eventOptions.queryKey,
        categoriesOptions.queryKey,
        meOptions.queryKey,
      ]);
      for (const secret of ['3174055203960004', '0396', 'Budi', 'Nadia']) expect(calls).not.toContain(secret);
      expect(d.analyticsAdapter.trackEvent).not.toHaveBeenCalled();
      expect(d.analyticsAdapter.reportError).not.toHaveBeenCalled();
      expect(d.analyticsAdapter.trackPageView.mock.calls).toEqual([['order']]);
    });
  });
});
