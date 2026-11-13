import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { OrderCategoriesResult } from '@core/use_case/booking/get-order-categories.use-case';
import { HoldBookingUseCase } from '@core/use_case/booking/hold-booking.use-case';
import { OrderTicketSelectionUseCase } from '@core/use_case/booking/order-ticket-selection.use-case';
import {
  ValidateAttendeeUseCase,
  type ValidateAttendeeResult,
} from '@core/use_case/booking/validate-attendee.use-case';
import { ERROR_CODE_MAP } from '@utils/constants/error-codes';
import { retryTransientOnce } from '@utils/query/retry';

import OrderController from '../order.controller';

let uuidCount = 0;
vi.mock('@utils/random-uuid', () => ({ randomUuid: () => `uuid-${++uuidCount}` }));

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
  resumed: false,
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
  dataUpdatedAt?: number;
  isPlaceholderData?: boolean;
}

const err = (status: number, code: string): QueryState => ({ isError: true, error: { status, code, message: 'raw' } });

/** nik_rejected reasons per NIK check answer (tracking plan §3); the other answers are not rejections. */
const NIK_REASONS: Record<string, string | undefined> = {
  'nik-invalid': 'NIK_INVALID',
  'seat-taken': 'NIK_SEAT_TAKEN',
  duplicate: 'DUPLICATE_NIK',
  unavailable: 'DUKCAPIL_UNAVAILABLE',
};

describe('OrderController', () => {
  let eventOptions: Record<string, unknown>;
  let categoriesOptions: Record<string, unknown>;
  let eventState: QueryState;
  let categoriesState: QueryState;
  let search: Record<string, string>;
  /** When the categories answer "arrived" by default: one number per test (a fresh one per render would re-anchor). */
  let answeredAt: number;
  const eventRefetch = vi.fn();
  const categoriesRefetch = vi.fn();
  const replace = vi.fn();
  const router = { replace, push: vi.fn() };
  const changeLanguage = vi.fn();
  const i18n = { language: 'id', changeLanguage };
  const t = vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  );
  const mutate = vi.fn();
  let mutationOptions: Record<string, (...args: never[]) => unknown>;
  // FR-16-W1: the hold mutation is told apart by its key; holdPending is flipped between renders.
  const holdMutate = vi.fn();
  let holdOptions: Record<string, (...args: never[]) => unknown>;
  let holdPending: boolean;
  const toggleLoading = vi.fn();
  const openPopupError = vi.fn();
  const { checkNik } = ValidateAttendeeUseCase({ bookingService: {} as never });

  const deps = () => ({
    catalogService: { listEvents: vi.fn(), getEvent: vi.fn().mockResolvedValue({ data: event, status: 200 }) },
    getOrderCategoriesUseCase: { execute: vi.fn().mockResolvedValue(okResult) },
    orderTicketSelectionUseCase: OrderTicketSelectionUseCase(),
    validateAttendeeUseCase: { checkNik, execute: vi.fn() },
    endOrderWindowUseCase: { execute: vi.fn(() => ({ kind: 'ended' })) },
    holdBookingUseCase: { ...HoldBookingUseCase({ bookingService: {} as never }), execute: vi.fn() },
    admissionStore: { get: vi.fn().mockReturnValue('adm_token'), set: vi.fn(), clear: vi.fn() },
    analyticsAdapter: { trackPageView: vi.fn(), trackEvent: vi.fn(), reportError: vi.fn(), setUser: vi.fn() },
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    ERROR_CODE_MAP: {
      NETWORK_ERROR: 'error_network_error',
      UNAUTHORIZED: 'error_unauthorized',
      INTERNAL_ERROR: 'error_internal_error',
      UNKNOWN_ERROR: 'error_unknown_error',
    },
    useTranslation: () => ({ t, i18n }),
    useRouterNext: () => router,
    useMutationTanstack: (options: Record<string, (...args: never[]) => unknown> & { mutationKey?: unknown[] }) => {
      if (options.mutationKey?.[0] === 'order-hold') {
        holdOptions = options;
        return { mutate: holdMutate, isPending: holdPending };
      }
      mutationOptions = options;
      return { mutate, isPending: false };
    },
    useLoading: () => ({ isLoading: false, toggleLoading }),
    usePopupError: () => ({ openPopupError, closePopupError: vi.fn() }),
    useSearchParamsNext: () => ({ get: (key: string) => search[key] ?? null }),
    useQueryTanstack: (options: { queryKey: unknown[] } & Record<string, unknown>) => {
      if (options.queryKey[0] === 'event') {
        eventOptions = options;
        return { data: undefined, isError: false, error: null, refetch: eventRefetch, ...eventState };
      }
      categoriesOptions = options;
      return {
        data: undefined,
        isError: false,
        error: null,
        refetch: categoriesRefetch,
        dataUpdatedAt: answeredAt,
        isPlaceholderData: false,
        ...categoriesState,
      };
    },
  });

  /** The analytics event names sent so far, in order. */
  const sent = (d: ReturnType<typeof deps>) =>
    d.analyticsAdapter.trackEvent.mock.calls.map((call: unknown[]) => call[0] as string);

  const render = (d = deps()) => renderHook(() => OrderController(d as never));

  beforeEach(() => {
    vi.clearAllMocks();
    eventState = {};
    categoriesState = {};
    search = { event: 'evt_samudra' };
    i18n.language = 'id';
    answeredAt = Date.now();
    holdPending = false;
    uuidCount = 0;
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
      expect(sent(d)).toEqual(['view_item']);
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
      expect(sent(d)).toEqual(['view_item']);
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
        name: {
          id: 'order-holder-cat_festival-1-name',
          value: '',
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
      expect(holder).toMatchObject({ key: 'cat_festival-1', name: { value: '' } });
      act(() => {
        holder.name.onChange('Budi');
        holder.nik.onChange('3174');
      });
      expect(result.current.holders[0]).toMatchObject({ name: { value: '' }, nik: { value: '' } });
    });
  });

  describe('holders without a profile', () => {
    it('never reads the profile: every holder name is typed in (the profile holds no NIK, D17)', () => {
      eventState = { data: event };
      categoriesState = { data: openResult };
      const queried: unknown[] = [];
      const d = deps();
      const { result } = render({
        ...d,
        useQueryTanstack: (options: { queryKey: unknown[] } & Record<string, unknown>) => {
          queried.push(options.queryKey[0]);
          return d.useQueryTanstack(options);
        },
      });
      expect(queried).not.toContain('me');
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.holders[0].name.onChange('Nadia Saputri'));
      expect(result.current.holders[0].name).toEqual(
        expect.objectContaining({ value: 'Nadia Saputri', hint: 'order_holder_name_hint' }),
      );
      expect(result.current.holders[0]).not.toHaveProperty('choose');
    });
  });

  describe('NIK', () => {
    it('keeps digits only, shows them while focused and masks them otherwise', () => {
      eventState = { data: event };
      categoriesState = { data: okResult };
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

      const calls = JSON.stringify([
        d.analyticsAdapter.trackEvent.mock.calls,
        d.analyticsAdapter.reportError.mock.calls,
        d.analyticsAdapter.trackPageView.mock.calls,
        d.storage.set.mock.calls,
        eventOptions.queryKey,
        categoriesOptions.queryKey,
      ]);
      for (const secret of ['3174055203960004', '0396', 'Budi']) expect(calls).not.toContain(secret);
      expect(sent(d)).toEqual(['view_item']);
      expect(d.analyticsAdapter.reportError).not.toHaveBeenCalled();
      expect(d.analyticsAdapter.trackPageView.mock.calls).toEqual([['order']]);
    });
  });

  describe('NIK checks', () => {
    /** Structurally valid KTP NIKs (province 31/32, day 41–71, month 01–12, serial ≠ 0000). */
    const NIK_A = '3174055203960004';
    const NIK_B = '3174055203960001';
    const NIK_C = '3201014101900002';
    const BAD_STRUCTURE = '0074055203960004';
    type Hook = { result: { current: ReturnType<typeof OrderController> } };
    type Vars = { slotKey: string; fieldIndex: number; fullName: string; nik: string };

    const ready = () => {
      eventState = { data: event };
      categoriesState = { data: openResult };
    };
    const holder = (hook: Hook, i: number) => hook.result.current.holders[i];
    /** Types a name and a NIK, then leaves the NIK field (blur). */
    const fill = (hook: Hook, i: number, name: string, nik: string) => {
      act(() => holder(hook, i).name.onChange(name));
      act(() => holder(hook, i).nik.onFocus());
      act(() => holder(hook, i).nik.onChange(nik));
      act(() => holder(hook, i).nik.onBlur());
    };
    const lastVars = () => mutate.mock.calls.at(-1)?.[0] as Vars;
    const start = (v: Vars) => act(() => void mutationOptions.onMutate(v as never));
    const settle = (result: ValidateAttendeeResult, v: Vars) =>
      act(() => void mutationOptions.onSuccess(result as never, v as never));
    const fail = (code: string, v: Vars) =>
      act(() => void mutationOptions.onError({ status: 0, code, message: 'raw' } as never, v as never));
    /** Fills ticket i and runs the whole check with `result`. */
    const checked = (hook: Hook, i: number, name: string, nik: string, result: ValidateAttendeeResult) => {
      fill(hook, i, name, nik);
      const v = lastVars();
      start(v);
      settle(result, v);
      return v;
    };
    const validResult: ValidateAttendeeResult = {
      kind: 'valid',
      validationToken: 'vt_secret',
      nikMasked: '3174********0004',
      expiresAt: '2026-11-09T03:10:00Z',
    };
    const one = () => {
      ready();
      const hook = render();
      act(() => hook.result.current.increment('cat_festival'));
      return hook;
    };

    it('starts idle with no message and is not verified', () => {
      const hook = one();
      expect(holder(hook, 0).nik).toMatchObject({ checking: false, canRecheck: false });
      expect(holder(hook, 0).nik.error).toBeUndefined();
      expect(holder(hook, 0).nik.valid).toBeUndefined();
      expect(hook.result.current.allHoldersVerified).toBe(false);
      act(() => holder(hook, 0).nik.recheck());
      expect(mutate).not.toHaveBeenCalled();
    });

    it('runs the mutation without retries and without the loading overlay', () => {
      one();
      expect(mutationOptions.retry).toBe(false);
    });

    it.each([
      ['incomplete', '3174', 'order_nik_incomplete'],
      ['invalid-structure', BAD_STRUCTURE, 'order_nik_invalid_structure'],
    ])('shows the %s error only after a blur and while not focused', (_kind, nik, key) => {
      const hook = one();
      act(() => holder(hook, 0).name.onChange('Budi'));
      act(() => holder(hook, 0).nik.onFocus());
      act(() => holder(hook, 0).nik.onChange(nik));
      expect(holder(hook, 0).nik.error).toBeUndefined();
      act(() => holder(hook, 0).nik.onBlur());
      expect(holder(hook, 0).nik.error).toBe(key);
      expect(holder(hook, 0).nik.canRecheck).toBe(false);
      act(() => holder(hook, 0).nik.onFocus());
      expect(holder(hook, 0).nik.error).toBeUndefined();
      act(() => holder(hook, 0).nik.onBlur());
      expect(holder(hook, 0).nik.error).toBe(key);
      expect(mutate).not.toHaveBeenCalled();
    });

    it('shows no message for an empty NIK after a blur', () => {
      const hook = one();
      act(() => holder(hook, 0).name.onChange('Budi'));
      act(() => holder(hook, 0).nik.onBlur());
      expect(holder(hook, 0).nik.error).toBeUndefined();
      expect(mutate).not.toHaveBeenCalled();
    });

    it('flags a repeated NIK on the later ticket at once, even while focused, and clears it when the first changes', () => {
      ready();
      const hook = render();
      act(() => hook.result.current.increment('cat_festival'));
      act(() => hook.result.current.increment('cat_festival'));
      act(() => holder(hook, 0).nik.onChange(NIK_A));
      act(() => holder(hook, 1).name.onChange('Budi'));
      act(() => holder(hook, 1).nik.onFocus());
      act(() => holder(hook, 1).nik.onChange(NIK_A));
      expect(holder(hook, 1).nik.error).toBe('order_nik_duplicate:{"index":1}');
      expect(holder(hook, 0).nik.error).toBeUndefined();
      act(() => holder(hook, 1).nik.onBlur());
      expect(mutate).not.toHaveBeenCalled();
      act(() => holder(hook, 0).nik.onChange(NIK_B));
      expect(holder(hook, 1).nik.error).toBeUndefined();
    });

    it('lets a local duplicate win over a stored valid result', () => {
      ready();
      const hook = render();
      act(() => hook.result.current.increment('cat_festival'));
      act(() => hook.result.current.increment('cat_festival'));
      checked(hook, 1, 'Budi', NIK_A, validResult);
      expect(holder(hook, 1).nik.valid).toBe('order_nik_valid');
      act(() => holder(hook, 0).nik.onChange(NIK_A));
      expect(holder(hook, 1).nik).toMatchObject({ error: 'order_nik_duplicate:{"index":1}', valid: undefined });
      expect(hook.result.current.allHoldersVerified).toBe(false);
    });

    it('checks on NIK blur with the slot field index, once per value pair', () => {
      ready();
      const hook = render();
      act(() => hook.result.current.increment('cat_festival'));
      act(() => hook.result.current.increment('cat_tribune'));
      fill(hook, 1, 'Budi Santoso', NIK_A);
      expect(mutate).toHaveBeenCalledTimes(1);
      expect(mutate).toHaveBeenCalledWith({
        slotKey: 'cat_tribune-1',
        fieldIndex: 1,
        fullName: 'Budi Santoso',
        nik: NIK_A,
      });
      start(lastVars());
      expect(holder(hook, 1).nik).toMatchObject({ checking: true, canRecheck: false, error: undefined });
      act(() => holder(hook, 1).nik.onBlur());
      act(() => holder(hook, 1).name.onBlur());
      act(() => holder(hook, 1).nik.recheck());
      expect(mutate).toHaveBeenCalledTimes(1);
      settle(validResult, lastVars());
      act(() => holder(hook, 1).nik.onBlur());
      act(() => holder(hook, 1).name.onBlur());
      expect(mutate).toHaveBeenCalledTimes(1);
    });

    it('checks on name blur once the NIK is locally ok, never with a blank name', () => {
      const hook = one();
      act(() => holder(hook, 0).nik.onChange(NIK_A));
      act(() => holder(hook, 0).nik.onBlur());
      act(() => holder(hook, 0).name.onChange('   '));
      act(() => holder(hook, 0).name.onBlur());
      expect(mutate).not.toHaveBeenCalled();
      act(() => holder(hook, 0).name.onChange('Budi'));
      act(() => holder(hook, 0).name.onBlur());
      expect(mutate).toHaveBeenCalledWith({ slotKey: 'cat_festival-1', fieldIndex: 0, fullName: 'Budi', nik: NIK_A });
    });

    it('reads the admission token at call time and never puts it in the variables', async () => {
      const d = deps();
      d.admissionStore.get.mockReturnValue('adm-1');
      d.validateAttendeeUseCase.execute.mockResolvedValue(validResult);
      ready();
      const hook = render(d);
      act(() => hook.result.current.increment('cat_festival'));
      fill(hook, 0, 'Budi', NIK_A);
      const v = lastVars();
      expect(JSON.stringify(v)).not.toContain('adm-1');
      expect(d.admissionStore.get).not.toHaveBeenCalled();
      await expect(mutationOptions.mutationFn(v as never)).resolves.toEqual(validResult);
      expect(d.admissionStore.get).toHaveBeenCalledWith('evt_samudra');
      expect(d.validateAttendeeUseCase.execute).toHaveBeenCalledWith({
        eventId: 'evt_samudra',
        admissionToken: 'adm-1',
        fieldIndex: 0,
        fullName: 'Budi',
        nik: NIK_A,
      });
    });

    it.each<[string, ValidateAttendeeResult, { error?: string; valid?: string; canRecheck: boolean }]>([
      ['valid', validResult, { valid: 'order_nik_valid', canRecheck: false }],
      ['nik-invalid', { kind: 'nik-invalid' }, { error: 'error_nik_invalid', canRecheck: false }],
      [
        'seat-taken',
        { kind: 'seat-taken' },
        { error: 'error_nik_seat_taken order_nik_use_another', canRecheck: false },
      ],
      ['duplicate', { kind: 'duplicate' }, { error: 'error_duplicate_nik', canRecheck: false }],
      [
        'rate-limited with seconds',
        { kind: 'rate-limited', retryAfterSeconds: 60 },
        { error: 'order_nik_rate_limited:{"count":60}', canRecheck: true },
      ],
      [
        'rate-limited without seconds',
        { kind: 'rate-limited', retryAfterSeconds: null },
        { error: 'order_nik_rate_limited_later', canRecheck: true },
      ],
      ['unavailable', { kind: 'unavailable' }, { error: 'order_nik_unavailable', canRecheck: true }],
    ])('shows the %s answer under the field and tracks its outcome', (_label, answer, expected) => {
      const d = deps();
      ready();
      const hook = render(d);
      act(() => hook.result.current.increment('cat_festival'));
      checked(hook, 0, 'Budi', NIK_A, answer);
      expect(holder(hook, 0).nik).toMatchObject({ checking: false, ...expected });
      if (!expected.error) expect(holder(hook, 0).nik.error).toBeUndefined();
      if (!expected.valid) expect(holder(hook, 0).nik.valid).toBeUndefined();
      expect(hook.result.current.allHoldersVerified).toBe(answer.kind === 'valid');
      const reason = NIK_REASONS[answer.kind];
      expect(sent(d)).toEqual([
        'view_item',
        ...(reason ? ['nik_rejected'] : []),
        ...(answer.kind === 'valid' ? ['holders_complete'] : []),
      ]);
      if (reason) {
        expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('nik_rejected', { event_id: 'evt_samudra', reason });
      }
      if (answer.kind === 'valid') {
        expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('holders_complete', {
          event_id: 'evt_samudra',
          ticket_count: 1,
        });
      }
      expect(replace).not.toHaveBeenCalled();
    });

    it.each([
      ['UNAUTHORIZED', 'error_unauthorized'],
      ['SOMETHING_NEW', 'error_unknown_error'],
    ])('maps an unclassified %s failure to a field error, without popup or analytics', (code, key) => {
      const d = deps();
      ready();
      const hook = render(d);
      act(() => hook.result.current.increment('cat_festival'));
      fill(hook, 0, 'Budi', NIK_A);
      const v = lastVars();
      start(v);
      fail(code, v);
      expect(holder(hook, 0).nik).toMatchObject({ error: key, canRecheck: true, checking: false });
      expect(holder(hook, 0).nik.error).not.toContain('raw');
      expect(sent(d)).toEqual(['view_item']);
      expect(d.analyticsAdapter.reportError).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
    });

    it('rechecks a retryable failure with the current values, and only then', () => {
      const hook = one();
      checked(hook, 0, 'Budi', NIK_A, { kind: 'unavailable' });
      expect(mutate).toHaveBeenCalledTimes(1);
      act(() => holder(hook, 0).nik.recheck());
      expect(mutate).toHaveBeenCalledTimes(2);
      const v = lastVars();
      expect(v).toEqual({ slotKey: 'cat_festival-1', fieldIndex: 0, fullName: 'Budi', nik: NIK_A });
      start(v);
      expect(holder(hook, 0).nik).toMatchObject({ checking: true, canRecheck: false });
      act(() => holder(hook, 0).nik.recheck());
      expect(mutate).toHaveBeenCalledTimes(2);
      settle({ kind: 'nik-invalid' }, v);
      act(() => holder(hook, 0).nik.recheck());
      expect(mutate).toHaveBeenCalledTimes(2);
    });

    it('gives each of two concurrent checks its own result', () => {
      ready();
      const hook = render();
      act(() => hook.result.current.increment('cat_festival'));
      act(() => hook.result.current.increment('cat_festival'));
      fill(hook, 0, 'Budi', NIK_A);
      const first = lastVars();
      start(first);
      fill(hook, 1, 'Sari', NIK_B);
      const second = lastVars();
      start(second);
      expect(hook.result.current.holders.map((h) => h.nik.checking)).toEqual([true, true]);
      settle({ kind: 'seat-taken' }, second);
      expect(holder(hook, 0).nik.checking).toBe(true);
      expect(holder(hook, 1).nik.error).toBe('error_nik_seat_taken order_nik_use_another');
      settle(validResult, first);
      expect(holder(hook, 0).nik.valid).toBe('order_nik_valid');
      expect(holder(hook, 1).nik.error).toBe('error_nik_seat_taken order_nik_use_another');
    });

    it('ignores answers for values that have since changed', () => {
      const hook = one();
      fill(hook, 0, 'Budi', NIK_A);
      const v = lastVars();
      start(v);
      act(() => holder(hook, 0).nik.onChange(NIK_B));
      expect(holder(hook, 0).nik.checking).toBe(false);
      settle(validResult, v);
      expect(holder(hook, 0).nik.valid).toBeUndefined();
      fail('UNAUTHORIZED', v);
      expect(holder(hook, 0).nik.error).toBeUndefined();
      act(() => holder(hook, 0).nik.onChange(NIK_A));
      expect(holder(hook, 0).nik).toMatchObject({ checking: false, valid: undefined, error: undefined });

      act(() => holder(hook, 0).nik.onBlur());
      const again = lastVars();
      start(again);
      act(() => holder(hook, 0).name.onChange('Budi S'));
      settle(validResult, again);
      expect(holder(hook, 0).nik.valid).toBeUndefined();
      act(() => holder(hook, 0).name.onChange('Budi'));
      expect(holder(hook, 0).nik.valid).toBeUndefined();
    });

    it('keeps the result when a change leaves the values the same', () => {
      const hook = one();
      checked(hook, 0, 'Budi', NIK_A, validResult);
      act(() => holder(hook, 0).nik.onChange(`${NIK_A}x`));
      act(() => holder(hook, 0).name.onChange('Budi'));
      expect(holder(hook, 0).nik.valid).toBe('order_nik_valid');
    });

    it('drops the run and touched flag of a removed ticket', () => {
      ready();
      const hook = render();
      act(() => hook.result.current.increment('cat_festival'));
      act(() => hook.result.current.increment('cat_festival'));
      checked(hook, 0, 'Budi', NIK_A, validResult);
      fill(hook, 1, 'Sari', '3174');
      expect(holder(hook, 1).nik.error).toBe('order_nik_incomplete');
      act(() => hook.result.current.decrement('cat_festival'));
      act(() => hook.result.current.decrement('cat_festival'));
      act(() => hook.result.current.increment('cat_festival'));
      act(() => hook.result.current.increment('cat_festival'));
      act(() => holder(hook, 0).name.onChange('Budi'));
      act(() => holder(hook, 0).nik.onChange(NIK_A));
      act(() => holder(hook, 1).nik.onChange('3174'));
      expect(holder(hook, 0).nik).toMatchObject({ valid: undefined, checking: false });
      expect(holder(hook, 1).nik.error).toBeUndefined();
    });

    it('keeps the run of a ticket that stays when another is removed', () => {
      ready();
      const hook = render();
      act(() => hook.result.current.increment('cat_festival'));
      act(() => hook.result.current.increment('cat_tribune'));
      checked(hook, 1, 'Budi', NIK_A, validResult);
      act(() => hook.result.current.decrement('cat_festival'));
      expect(holder(hook, 0).nik.valid).toBe('order_nik_valid');
      expect(hook.result.current.allHoldersVerified).toBe(true);
    });

    it('goes back to the waiting room once on admission-invalid, with no event or message', () => {
      const d = deps();
      ready();
      const hook = render(d);
      act(() => hook.result.current.increment('cat_festival'));
      fill(hook, 0, 'Budi', NIK_A);
      const v = lastVars();
      start(v);
      settle({ kind: 'admission-invalid' }, v);
      settle({ kind: 'admission-invalid' }, v);
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith('/queue?event=evt_samudra');
      expect(sent(d)).toEqual(['view_item']);
      expect(holder(hook, 0).nik).toMatchObject({ error: undefined, valid: undefined });
    });

    it('is verified only when every holder is valid (Data Models example)', () => {
      ready();
      const hook = render();
      act(() => hook.result.current.increment('cat_festival'));
      act(() => hook.result.current.increment('cat_festival'));
      act(() => hook.result.current.increment('cat_tribune'));
      checked(hook, 0, 'Nadia', NIK_A, validResult);
      act(() => holder(hook, 1).nik.onFocus());
      act(() => holder(hook, 1).nik.onChange(NIK_A));
      expect(hook.result.current.holders.map((h) => [h.nik.valid, h.nik.error])).toEqual([
        ['order_nik_valid', undefined],
        [undefined, 'order_nik_duplicate:{"index":1}'],
        [undefined, undefined],
      ]);
      expect(hook.result.current.allHoldersVerified).toBe(false);
      checked(hook, 1, 'Sari', NIK_B, validResult);
      expect(hook.result.current.allHoldersVerified).toBe(false);
      checked(hook, 2, 'Dewi', NIK_C, validResult);
      expect(hook.result.current.allHoldersVerified).toBe(true);
      act(() => holder(hook, 2).name.onChange('Dewi A'));
      expect(hook.result.current.allHoldersVerified).toBe(false);
    });

    it('retranslates every message on a language change without checking again', () => {
      ready();
      let current = { t: (key: string) => `id:${key}`, i18n: { language: 'id', changeLanguage } };
      const d = { ...deps(), useTranslation: () => current };
      const hook = renderHook(() => OrderController(d as never));
      act(() => hook.result.current.increment('cat_festival'));
      act(() => hook.result.current.increment('cat_festival'));
      checked(hook, 0, 'Budi', NIK_A, validResult);
      checked(hook, 1, 'Sari', NIK_B, { kind: 'unavailable' });
      expect(mutate).toHaveBeenCalledTimes(2);
      current = { t: (key: string) => `en:${key}`, i18n: { language: 'en', changeLanguage } };
      hook.rerender();
      expect(holder(hook, 0).nik.valid).toBe('en:order_nik_valid');
      expect(holder(hook, 1).nik.error).toBe('en:order_nik_unavailable');
      expect(mutate).toHaveBeenCalledTimes(2);
    });

    it('never passes a NIK, name or token to analytics', () => {
      const d = deps();
      ready();
      const hook = render(d);
      act(() => hook.result.current.increment('cat_festival'));
      act(() => hook.result.current.increment('cat_festival'));
      checked(hook, 0, 'Budi Santoso', NIK_A, validResult);
      const v = (() => {
        fill(hook, 1, 'Sari Dewi', NIK_B);
        return lastVars();
      })();
      start(v);
      fail('UNAUTHORIZED', v);
      const calls = JSON.stringify([
        d.analyticsAdapter.trackEvent.mock.calls,
        d.analyticsAdapter.reportError.mock.calls,
        d.analyticsAdapter.trackPageView.mock.calls,
      ]);
      for (const secret of [NIK_A, NIK_B, 'Budi', 'Sari', 'vt_secret', 'adm_token', '0004']) {
        expect(calls).not.toContain(secret);
      }
      expect(sent(d)).not.toContain('nik_rejected');
    });
  });

  describe('analytics (tracking plan)', () => {
    afterEach(() => vi.useRealTimers());

    it('sends view_item once with every category, the lowest price and the event as item_category', () => {
      eventState = { data: event };
      categoriesState = { data: okResult };
      const d = deps();
      const { rerender } = render(d);
      rerender();
      expect(sent(d)).toEqual(['view_item']);
      expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('view_item', {
        event_id: 'evt_samudra',
        currency: 'IDR',
        value: 450000,
        items: [
          {
            item_id: 'cat_festival',
            item_name: 'Festival',
            item_category: 'evt_samudra',
            item_brand: 'Samudra',
            price: 450000,
          },
          {
            item_id: 'cat_tribune',
            item_name: 'Tribun',
            item_category: 'evt_samudra',
            item_brand: 'Samudra',
            price: 1250000,
          },
        ],
      });
    });

    it('reports a page where every category is sold out as sold_out_seen', () => {
      eventState = { data: event };
      categoriesState = { data: { ...okResult, categories: [tribune] } };
      const d = deps();
      render(d);
      expect(sent(d)).toEqual(['view_item', 'sold_out_seen']);
      expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('sold_out_seen', {
        event_id: 'evt_samudra',
        where: 'order',
      });
    });

    it('sends add_to_cart once the count has settled for a second, with the picked categories only', () => {
      vi.useFakeTimers();
      eventState = { data: event };
      categoriesState = { data: openResult };
      const d = deps();
      const { result } = render(d);
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.increment('cat_festival'));
      act(() => vi.advanceTimersByTime(500));
      act(() => result.current.increment('cat_tribune'));
      act(() => vi.advanceTimersByTime(999));
      expect(sent(d)).toEqual(['view_item']);
      act(() => vi.advanceTimersByTime(1));
      expect(sent(d)).toEqual(['view_item', 'add_to_cart']);
      expect(d.analyticsAdapter.trackEvent).toHaveBeenLastCalledWith('add_to_cart', {
        event_id: 'evt_samudra',
        currency: 'IDR',
        value: 2 * 450000 + 1250000,
        items: [
          expect.objectContaining({ item_id: 'cat_festival', quantity: 2 }),
          expect.objectContaining({ item_id: 'cat_tribune', quantity: 1 }),
        ],
      });
      // Back to nothing picked: no add_to_cart for an empty cart.
      act(() => result.current.decrement('cat_tribune'));
      act(() => result.current.decrement('cat_festival'));
      act(() => result.current.decrement('cat_festival'));
      act(() => vi.advanceTimersByTime(2000));
      expect(sent(d)).toEqual(['view_item', 'add_to_cart']);
    });
  });

  describe('order countdown (FR-17-W1)', () => {
    const SERVER_NOW = '2026-11-09T03:00:00Z';
    const label = 'order_timer_label';
    /** Fakes the device clock and has the 300 s answer arrive `agoMs` before it. */
    const arrange = (deviceNow: string = SERVER_NOW, agoMs = 0, data: unknown = okResult) => {
      vi.useFakeTimers({ now: new Date(deviceNow) });
      eventState = { data: event };
      categoriesState = { data, dataUpdatedAt: Date.now() - agoMs };
    };
    const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each(['2026-11-09T03:00:00Z', '2026-11-08T17:00:00Z', '2031-06-01T00:00:00Z'])(
      'starts from the server window whatever the device clock says (%s)',
      (deviceNow) => {
        arrange(deviceNow);
        const { result } = render();
        expect(result.current.timer).toEqual({ seconds: 300, label });
        expect(result.current.timeUp).toBe(false);
        expect(vi.getTimerCount()).toBe(1);
      },
    );

    it('ticks down in whole seconds, never up, and stores no deadline', () => {
      arrange();
      const d = deps();
      const { result } = render(d);
      let previous = result.current.timer?.seconds ?? -1;
      for (let i = 0; i < 48; i += 1) {
        advance(1000);
        const seconds = result.current.timer?.seconds ?? -1;
        expect(Number.isInteger(seconds)).toBe(true);
        expect(seconds).toBeGreaterThanOrEqual(0);
        expect(seconds).toBeLessThanOrEqual(previous);
        previous = seconds;
      }
      expect(result.current.timer).toEqual({ seconds: 252, label });
      expect(result.current.timeUp).toBe(false);
      result.current.setLocale('en');
      expect(JSON.stringify(d.storage.set.mock.calls)).not.toContain('2026-11-09T03:05:00Z');
      expect(d.storage.set).toHaveBeenCalledTimes(1);
    });

    it('catches up after throttled timers: each tick reads the clock', () => {
      arrange();
      const { result } = render();
      act(() => {
        vi.setSystemTime(Date.now() + 99_000);
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.timer?.seconds).toBe(200);
    });

    it.each([
      [30_000, 270],
      [30_400, 269],
    ])('counts the time since the answer arrived, not since mount (%i ms → %i)', (agoMs, seconds) => {
      arrange(SERVER_NOW, agoMs);
      expect(render().result.current.timer?.seconds).toBe(seconds);
    });

    it('stops at 0 with timeUp and does not navigate (the sheet is FR-18-W1)', () => {
      arrange();
      const d = deps();
      const { result } = render(d);
      advance(299_000);
      expect(result.current.timer?.seconds).toBe(1);
      expect(result.current.timeUp).toBe(false);
      expect(vi.getTimerCount()).toBe(1);
      advance(1000);
      expect(result.current.timer).toEqual({ seconds: 0, label });
      expect(result.current.timeUp).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      advance(10_000);
      expect(result.current.timer).toEqual({ seconds: 0, label });
      expect(result.current.timeUp).toBe(true);
      expect(result.current.status).toBe('ready');
      expect(replace).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
      expect(mutate).not.toHaveBeenCalled();
      // view_item on load (tracking plan §2 step 7), then order_time_up at 0.
      expect(d.analyticsAdapter.trackEvent.mock.calls.map(([name]) => name)).toEqual(['view_item', 'order_time_up']);
      expect(d.analyticsAdapter.trackPageView.mock.calls).toEqual([['order']]);
    });

    it.each([
      ['equal to', '2026-11-09T03:00:00Z'],
      ['before', '2026-11-09T02:59:00Z'],
    ])('is up at once, without an interval, when expiresAt is %s serverNow', (_label, expiresAt) => {
      arrange(SERVER_NOW, 0, { ...okResult, expiresAt });
      const { result } = render();
      expect(result.current.timer).toEqual({ seconds: 0, label });
      expect(result.current.timeUp).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('carries on through a language switch (placeholder), then re-anchors to each new answer', () => {
      arrange();
      let current = { t: (key: string) => `id:${key}`, i18n: { language: 'id', changeLanguage } };
      const d = { ...deps(), useTranslation: () => current };
      const { result, rerender } = renderHook(() => OrderController(d as never));
      advance(100_000);
      expect(result.current.timer).toEqual({ seconds: 200, label: 'id:order_timer_label' });

      // The new key has never answered: previous data, dataUpdatedAt 0.
      current = { t: (key: string) => `en:${key}`, i18n: { language: 'en', changeLanguage } };
      categoriesState = { data: okResult, dataUpdatedAt: 0, isPlaceholderData: true };
      rerender();
      expect(categoriesOptions.queryKey).toEqual(['categories', 'evt_samudra', 'en']);
      expect(result.current.timer).toEqual({ seconds: 200, label: 'en:order_timer_label' });
      expect(result.current.timeUp).toBe(false);
      advance(10_000);
      expect(result.current.timer?.seconds).toBe(190);
      expect(result.current.timeUp).toBe(false);

      // The EN answer arrives 112 s after the first one.
      advance(2000);
      categoriesState = {
        data: { ...okResult, serverNow: '2026-11-09T03:01:52Z' },
        dataUpdatedAt: Date.now(),
        isPlaceholderData: false,
      };
      rerender();
      expect(result.current.timer?.seconds).toBe(188);
      advance(8000);
      expect(result.current.timer?.seconds).toBe(180);

      // A refetch with a later expiresAt moves the seconds up to the server's number.
      categoriesState = {
        data: { ...okResult, serverNow: '2026-11-09T03:02:00Z', expiresAt: '2026-11-09T03:10:00Z' },
        dataUpdatedAt: Date.now(),
      };
      rerender();
      expect(result.current.timer?.seconds).toBe(480);
      expect(vi.getTimerCount()).toBe(1);
    });

    it('re-anchors an identical answer by its new dataUpdatedAt', () => {
      arrange();
      const { result, rerender } = render();
      advance(60_000);
      expect(result.current.timer?.seconds).toBe(240);
      categoriesState = { data: okResult, dataUpdatedAt: Date.now() };
      rerender();
      expect(result.current.timer?.seconds).toBe(300);
    });

    it.each<[string, () => void]>([
      ['loading', () => (categoriesState = {})],
      ['a categories error', () => (categoriesState = err(500, 'INTERNAL_ERROR'))],
      ['no event id', () => (search = {})],
      ['event not found', () => (eventState = err(404, 'NOT_FOUND'))],
      ['an event error with categories ok', () => (eventState = err(0, 'NETWORK_ERROR'))],
      ['the event still loading with categories ok', () => (eventState = {})],
    ])('has no timer on %s', (_label, change) => {
      arrange();
      change();
      const { result } = render();
      expect(result.current.status).not.toBe('ready');
      expect(result.current.timer).toBeNull();
      expect(result.current.timeUp).toBe(false);
    });

    it('has no timer and no interval before an answer', () => {
      arrange();
      categoriesState = {};
      render();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('has no timer for admission-invalid, which still redirects once', () => {
      arrange(SERVER_NOW, 0, { kind: 'admission-invalid' });
      const { result, rerender } = render();
      rerender();
      expect(result.current.timer).toBeNull();
      expect(result.current.timeUp).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      expect(replace).toHaveBeenCalledTimes(1);
    });

    it('keeps the clock running while the event failed, so the value is right once ready', () => {
      arrange();
      eventState = err(0, 'NETWORK_ERROR');
      const { result, rerender } = render();
      expect(vi.getTimerCount()).toBe(1);
      advance(20_000);
      expect(result.current.timer).toBeNull();
      eventState = { data: event };
      rerender();
      expect(result.current.timer?.seconds).toBe(280);
    });

    it.each([
      ['expiresAt does not parse', { expiresAt: 'soon' }],
      ['serverNow is empty', { serverNow: '' }],
      ['expiresAt is missing', { expiresAt: undefined }],
      ['serverNow is missing', { serverNow: undefined }],
    ])('has no timer and no interval when %s, and the page stays usable', (_label, patch) => {
      arrange(SERVER_NOW, 0, { ...okResult, ...patch } as never);
      const { result } = render();
      expect(result.current.status).toBe('ready');
      expect(result.current.timer).toBeNull();
      expect(result.current.timeUp).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      advance(5000);
      expect(result.current.timer).toBeNull();
    });

    it('clears the interval on unmount', () => {
      arrange();
      const { unmount } = render();
      advance(3000);
      expect(vi.getTimerCount()).toBe(1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('order time up (FR-18-W1)', () => {
    const SERVER_NOW = '2026-11-09T03:00:00Z';
    const sheet = {
      stamp: 'order_time_up_stamp',
      title: 'order_time_up_title',
      body: 'order_time_up_body',
      queueAgainLabel: 'order_time_up_queue_again',
      homeLabel: 'action_back_home',
      homeHref: '/',
      queueAgain: expect.any(Function),
    };
    const arrange = (data: unknown = okResult) => {
      vi.useFakeTimers({ now: new Date(SERVER_NOW) });
      eventState = { data: event };
      categoriesState = { data, dataUpdatedAt: Date.now() };
    };
    const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
    const timeUpCalls = (d: ReturnType<typeof deps>) =>
      d.analyticsAdapter.trackEvent.mock.calls.filter(([name]) => name === 'order_time_up');

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows no sheet and ends nothing before zero', () => {
      arrange();
      const d = deps();
      const { result } = render(d);
      for (const step of [0, 150_000, 149_000]) {
        advance(step);
        expect(result.current.timeUp).toBe(false);
        expect(result.current.timeUpSheet).toBeNull();
      }
      expect(result.current.timer?.seconds).toBe(1);
      expect(d.endOrderWindowUseCase.execute).not.toHaveBeenCalled();
      expect(timeUpCalls(d)).toHaveLength(0);
    });

    it('shows the translated sheet at zero', () => {
      arrange();
      const { result } = render();
      advance(300_000);
      expect(result.current.timeUp).toBe(true);
      expect(result.current.timeUpSheet).toEqual(sheet);
    });

    it('shows the sheet at once for an answer already expired', () => {
      arrange({ ...okResult, expiresAt: okResult.serverNow });
      const d = deps();
      const { result } = render(d);
      expect(result.current.timeUp).toBe(true);
      expect(result.current.timeUpSheet).toEqual(sheet);
      expect(d.endOrderWindowUseCase.execute).toHaveBeenCalledTimes(1);
    });

    it('ends the window and tracks order_time_up exactly once, with the tickets at expiry', () => {
      arrange(openResult);
      const d = deps();
      const { result, rerender } = render(d);
      act(() => result.current.increment('cat_festival'));
      act(() => result.current.increment('cat_tribune'));
      expect(result.current.totalTickets).toBe(2);
      advance(300_000);
      act(() => result.current.decrement('cat_tribune'));
      expect(result.current.totalTickets).toBe(1);
      for (let i = 0; i < 6; i += 1) {
        advance(10_000);
        rerender();
      }
      expect(d.endOrderWindowUseCase.execute).toHaveBeenCalledTimes(1);
      expect(d.endOrderWindowUseCase.execute).toHaveBeenCalledWith('evt_samudra');
      expect(timeUpCalls(d)).toEqual([['order_time_up', { eventId: 'evt_samudra', tickets: 2 }]]);
    });

    it('latches: the sheet stays when the event refetch fails afterwards', () => {
      arrange();
      const d = deps();
      const { result, rerender } = render(d);
      advance(300_000);
      eventState = { isError: true, error: { status: 500, code: 'INTERNAL_ERROR', message: 'raw' } };
      rerender();
      expect(result.current.status).toBe('error');
      expect(result.current.timer).toBeNull();
      expect(result.current.timeUp).toBe(true);
      expect(result.current.timeUpSheet).not.toBeNull();
      expect(d.endOrderWindowUseCase.execute).toHaveBeenCalledTimes(1);
    });

    it('disables the categories query after expiry, also after a language switch', () => {
      arrange();
      let current = { t, i18n: { language: 'id', changeLanguage } };
      const d = { ...deps(), useTranslation: () => current };
      const { rerender } = renderHook(() => OrderController(d as never));
      expect(categoriesOptions.enabled).toBe(true);
      advance(300_000);
      expect(categoriesOptions.enabled).toBe(false);
      rerender();
      expect(categoriesOptions.enabled).toBe(false);
      current = { t, i18n: { language: 'en', changeLanguage } };
      categoriesState = { data: okResult, dataUpdatedAt: 0, isPlaceholderData: true };
      rerender();
      expect(categoriesOptions.queryKey).toEqual(['categories', 'evt_samudra', 'en']);
      expect(categoriesOptions.enabled).toBe(false);
    });

    it('does not redirect for admission-invalid after expiry (categories or NIK check)', () => {
      arrange();
      const { rerender } = render();
      advance(300_000);
      categoriesState = { data: { kind: 'admission-invalid' } };
      rerender();
      rerender();
      act(() => {
        mutationOptions.onSuccess(
          { kind: 'admission-invalid' } as never,
          { slotKey: 's', fieldIndex: 0, fullName: 'Nadia', nik: '3174' } as never,
        );
      });
      expect(replace).not.toHaveBeenCalled();
    });

    it('queueAgain tracks queue_rejoin and replaces the page with the waiting room', () => {
      arrange();
      const d = deps();
      const { result } = render(d);
      advance(300_000);
      act(() => result.current.timeUpSheet?.queueAgain());
      expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('queue_rejoin', {
        eventId: 'evt_samudra',
        from: 'order',
      });
      expect(replace).toHaveBeenCalledWith('/queue?event=evt_samudra');
      expect(router.push).not.toHaveBeenCalled();
    });

    it('retranslates the sheet on a language switch while the timer stays at 0', () => {
      arrange();
      let current = { t: (key: string) => `id:${key}`, i18n: { language: 'id', changeLanguage } };
      const d = { ...deps(), useTranslation: () => current };
      const { result, rerender } = renderHook(() => OrderController(d as never));
      advance(300_000);
      expect(result.current.timeUpSheet?.title).toBe('id:order_time_up_title');
      current = { t: (key: string) => `en:${key}`, i18n: { language: 'en', changeLanguage } };
      categoriesState = { data: okResult, dataUpdatedAt: 0, isPlaceholderData: true };
      rerender();
      expect(result.current.timeUpSheet).toMatchObject({
        stamp: 'en:order_time_up_stamp',
        title: 'en:order_time_up_title',
        body: 'en:order_time_up_body',
        queueAgainLabel: 'en:order_time_up_queue_again',
        homeLabel: 'en:action_back_home',
      });
      expect(result.current.timer?.seconds).toBe(0);
    });

    it('calls no service because of the expiry', () => {
      arrange();
      const d = deps();
      const { rerender } = render(d);
      advance(299_000);
      const before = [
        d.catalogService.getEvent.mock.calls.length,
        d.getOrderCategoriesUseCase.execute.mock.calls.length,
      ];
      advance(1000);
      rerender();
      expect([
        d.catalogService.getEvent.mock.calls.length,
        d.getOrderCategoriesUseCase.execute.mock.calls.length,
      ]).toEqual(before);
      expect(mutate).not.toHaveBeenCalled();
    });
  });

  describe('order resume after reload (FR-19-W1)', () => {
    const SERVER_NOW = '2026-11-09T03:00:00Z';
    const resumed: OrderCategoriesResult = { ...okResult, resumed: true, expiresAt: '2026-11-09T03:02:12Z' };
    const windowEnded = { kind: 'window-ended' };
    const sheet = {
      stamp: 'order_time_up_stamp',
      title: 'order_time_up_title',
      body: 'order_time_up_body',
      queueAgainLabel: 'order_time_up_queue_again',
      homeLabel: 'action_back_home',
      homeHref: '/',
      queueAgain: expect.any(Function),
    };
    const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
    const callsOf = (d: ReturnType<typeof deps>, event: string) =>
      d.analyticsAdapter.trackEvent.mock.calls.filter(([name]) => name === event);

    beforeEach(() => {
      vi.useFakeTimers({ now: new Date(SERVER_NOW) });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('window-ended shows the time-up sheet at once over the loading page', () => {
      eventState = { data: event };
      categoriesState = { data: windowEnded };
      const { result } = render();
      expect(result.current.timeUp).toBe(true);
      expect(result.current.timeUpSheet).toEqual(sheet);
      expect(result.current.status).toBe('loading');
      expect(result.current.timer).toBeNull();
    });

    it('window-ended ends the window and tracks order_time_up once, never redirects, disables the query', () => {
      eventState = { data: event };
      categoriesState = { data: windowEnded };
      const d = deps();
      const { rerender } = render(d);
      rerender();
      rerender();
      expect(d.endOrderWindowUseCase.execute).toHaveBeenCalledTimes(1);
      expect(d.endOrderWindowUseCase.execute).toHaveBeenCalledWith('evt_samudra');
      expect(callsOf(d, 'order_time_up')).toEqual([['order_time_up', { eventId: 'evt_samudra', tickets: 0 }]]);
      expect(replace).not.toHaveBeenCalled();
      expect(categoriesOptions.enabled).toBe(false);
    });

    it('window-ended before the event loads latches, and the sheet stays when the event then fails', () => {
      categoriesState = { data: windowEnded };
      const d = deps();
      const { result, rerender } = render(d);
      expect(result.current.timeUp).toBe(true);
      expect(d.endOrderWindowUseCase.execute).toHaveBeenCalledTimes(1);
      eventState = { isError: true, error: { status: 500, code: 'INTERNAL_ERROR', message: 'raw' } };
      rerender();
      expect(result.current.status).toBe('error');
      expect(result.current.timeUpSheet).not.toBeNull();
      expect(d.endOrderWindowUseCase.execute).toHaveBeenCalledTimes(1);
      expect(replace).not.toHaveBeenCalled();
    });

    it('admission-invalid still redirects once; a thrown error still shows the error state', () => {
      eventState = { data: event };
      categoriesState = { data: { kind: 'admission-invalid' } };
      const { result, rerender } = render();
      rerender();
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith('/queue?event=evt_samudra');
      expect(result.current.timeUp).toBe(false);

      categoriesState = err(503, 'INTERNAL_ERROR');
      const second = render();
      expect(second.result.current.status).toBe('error');
      expect(second.result.current.errorMessage).toBe('error_internal_error');
      expect(second.result.current.timeUp).toBe(false);
    });

    it('a resumed 132 s answer counts down from 2:12', () => {
      eventState = { data: event };
      categoriesState = { data: resumed, dataUpdatedAt: Date.now() };
      const { result } = render();
      expect(result.current.status).toBe('ready');
      expect(result.current.timer?.seconds).toBe(132);
      advance(1000);
      expect(result.current.timer?.seconds).toBe(131);
      expect(result.current.timeUp).toBe(false);
    });

    it('a resumed answer already at its end shows the sheet in the first ready render', () => {
      eventState = { data: event };
      categoriesState = { data: { ...resumed, expiresAt: resumed.serverNow }, dataUpdatedAt: Date.now() };
      const { result } = render();
      expect(result.current.status).toBe('ready');
      expect(result.current.timeUp).toBe(true);
      expect(result.current.timeUpSheet).toEqual(sheet);
    });

    it('tracks order_resumed once per visit, through tickets and a language switch', () => {
      eventState = { data: event };
      categoriesState = { data: resumed, dataUpdatedAt: Date.now() };
      let current = { t, i18n: { language: 'id', changeLanguage } };
      const d = { ...deps(), useTranslation: () => current };
      const { result, rerender } = renderHook(() => OrderController(d as never));
      rerender();
      act(() => result.current.increment('cat_festival'));
      current = { t, i18n: { language: 'en', changeLanguage } };
      categoriesState = { data: resumed, dataUpdatedAt: 0, isPlaceholderData: true };
      rerender();
      categoriesState = { data: okResult, dataUpdatedAt: Date.now() + 5000, isPlaceholderData: false };
      rerender();
      expect(callsOf(d, 'order_resumed')).toEqual([['order_resumed', { eventId: 'evt_samudra' }]]);
    });

    it('never tracks order_resumed for a non-resumed answer', () => {
      eventState = { data: event };
      categoriesState = { data: okResult, dataUpdatedAt: Date.now() };
      const d = deps();
      const { rerender } = render(d);
      rerender();
      expect(callsOf(d, 'order_resumed')).toHaveLength(0);
    });

    it('maps ADMISSION_UNAVAILABLE to its message with the real error map', () => {
      expect(ERROR_CODE_MAP.ADMISSION_UNAVAILABLE).toBe('error_admission_unavailable');
      eventState = { data: event };
      categoriesState = err(503, 'ADMISSION_UNAVAILABLE');
      const { result } = renderHook(() => OrderController({ ...deps(), ERROR_CODE_MAP } as never));
      expect(result.current.status).toBe('error');
      expect(result.current.errorMessage).toBe('error_admission_unavailable');
      act(() => result.current.retry());
      expect(categoriesRefetch).toHaveBeenCalled();
    });

    it('keeps the categories query options and reads the token at fetch time, null included', async () => {
      const d = deps();
      d.admissionStore.get.mockReturnValue(null);
      render(d);
      expect(categoriesOptions).toMatchObject({
        queryKey: ['categories', 'evt_samudra', 'id'],
        gcTime: 0,
        retry: retryTransientOnce,
      });
      expect(categoriesOptions.placeholderData).toEqual(expect.any(Function));
      await (categoriesOptions.queryFn as () => Promise<unknown>)();
      expect(d.getOrderCategoriesUseCase.execute).toHaveBeenCalledWith({
        eventId: 'evt_samudra',
        admissionToken: null,
      });
    });
  });

  describe('order hold (FR-16-W1)', () => {
    const NIK_A = '3174055203960004';
    const NIK_B = '3174055203960001';
    const NIK_C = '3201014101900002';
    const SIGN_IN = '/login?next=%2Forder%3Fevent%3Devt_samudra';
    type Hook = { result: { current: ReturnType<typeof OrderController> }; rerender: () => void };
    type Vars = { slotKey: string; fieldIndex: number; fullName: string; nik: string };
    type HoldInput = {
      eventId: string;
      admissionToken: string | null;
      idempotencyKey: string;
      tickets: { categoryId: string; validationToken: string; nikLast4: string }[];
      bookingId: string | null;
    };

    const festivalB: Category = {
      categoryId: 'cat_b',
      name: 'Festival B',
      seating: 'standing',
      price: { amount: 850000, currency: 'IDR' },
      availability: 'available',
    };
    const tribunAtas: Category = {
      categoryId: 'cat_t',
      name: 'Tribun Atas',
      seating: 'seated',
      price: { amount: 450000, currency: 'IDR' },
      availability: 'available',
    };
    const holdResult: OrderCategoriesResult = {
      ...okResult,
      categories: [festivalB, tribunAtas],
      adminFee: { amount: 10000, currency: 'IDR' },
    };
    const names = ['Nadia', 'Sari', 'Dewi'];
    const niks = [NIK_A, NIK_B, NIK_C];

    /** The real error map: the hold maps codes the minimal test map does not have. */
    const holdDeps = () => ({ ...deps(), ERROR_CODE_MAP });
    const ready = () => {
      eventState = { data: event };
      categoriesState = { data: holdResult, dataUpdatedAt: answeredAt };
    };
    const valid = (token: string): ValidateAttendeeResult => ({
      kind: 'valid',
      validationToken: token,
      nikMasked: '3174********0004',
      expiresAt: '2026-11-09T03:10:00Z',
    });
    const holder = (hook: Hook, i: number) => hook.result.current.holders[i];
    /** Fills ticket i and settles its Dukcapil check with `result`. */
    const check = (hook: Hook, i: number, name: string, nik: string, result: ValidateAttendeeResult) => {
      act(() => holder(hook, i).name.onChange(name));
      act(() => holder(hook, i).nik.onFocus());
      act(() => holder(hook, i).nik.onChange(nik));
      act(() => holder(hook, i).nik.onBlur());
      const v = mutate.mock.calls.at(-1)?.[0] as Vars;
      act(() => void mutationOptions.onMutate(v as never));
      act(() => void mutationOptions.onSuccess(result as never, v as never));
    };
    /** Picks the categories in order and verifies every holder (tokens vt_0, vt_1, …). */
    const arrange = (picks: string[] = ['cat_b', 'cat_b'], d = holdDeps()) => {
      ready();
      const hook = renderHook(() => OrderController(d as never));
      for (const id of picks) act(() => hook.result.current.increment(id));
      picks.forEach((_, i) => check(hook, i, names[i], niks[i], valid(`vt_${i}`)));
      return { hook, d };
    };
    const tap = (hook: Hook) => act(() => hook.result.current.checkout?.onContinue());
    const lastInput = () => holdMutate.mock.calls.at(-1)?.[0] as HoldInput;
    const succeed = (result: unknown, input: HoldInput = lastInput()) =>
      act(() => void holdOptions.onSuccess(result as never, input as never));
    const failWith = (error: Record<string, unknown>, input: HoldInput = lastInput()) =>
      act(() => void holdOptions.onError({ message: 'raw', ...error } as never, input as never));
    /** Tracking plan §3 `nik_rejected` calls; the plan has no web-only hold events. */
    const failed = (d: ReturnType<typeof holdDeps>) =>
      d.analyticsAdapter.trackEvent.mock.calls.filter(([name]) => name === 'nik_rejected').map(([, p]) => p);
    const webOnly = (d: ReturnType<typeof holdDeps>) =>
      d.analyticsAdapter.trackEvent.mock.calls.filter(
        ([name]) => String(name).startsWith('order_hold') || name === 'order_continue_tapped',
      );

    afterEach(() => {
      vi.useRealTimers();
    });

    it('registers one hold mutation by key, without retries', () => {
      arrange([]);
      expect(holdOptions.mutationKey).toEqual(['order-hold']);
      expect(holdOptions.retry).toBe(false);
    });

    it('summarises lines in category order, the fee once per order and the total (ID and EN)', () => {
      const { hook } = arrange(['cat_t', 'cat_b', 'cat_b']);
      expect(hook.result.current.summary).toEqual({
        heading: 'order_summary_heading',
        lines: [
          {
            key: 'cat_b',
            label: 'order_summary_line:{"quantity":2,"category":"Festival B"}',
            amount: 'Rp 1.700.000',
          },
          { key: 'cat_t', label: 'order_summary_line:{"quantity":1,"category":"Tribun Atas"}', amount: 'Rp 450.000' },
        ],
        feeLabel: 'order_summary_fee',
        fee: 'Rp 10.000',
        totalLabel: 'order_summary_total',
        total: 'Rp 2.160.000',
        note: 'order_summary_note',
        ticketCount: 'order_summary_tickets:{"count":3}',
        dockLabel: 'order_summary_dock_label',
      });
      i18n.language = 'en';
      hook.rerender();
      expect(hook.result.current.summary?.total).toBe('Rp 2,160,000');
      expect(hook.result.current.summary?.lines[0].amount).toBe('Rp 1,700,000');
    });

    it('charges the same fee for 1, 2 or 3 tickets', () => {
      ready();
      const hook = renderHook(() => OrderController(holdDeps() as never));
      const fees: (string | undefined)[] = [];
      for (let i = 0; i < 3; i += 1) {
        act(() => hook.result.current.increment('cat_b'));
        fees.push(hook.result.current.summary?.fee);
      }
      expect(fees).toEqual(['Rp 10.000', 'Rp 10.000', 'Rp 10.000']);
      expect(hook.result.current.summary?.total).toBe('Rp 2.560.000');
    });

    it.each<[string, () => void]>([
      ['loading', () => {}],
      ['error', () => void (eventState = err(0, 'NETWORK_ERROR'))],
      ['not-found', () => void (search = {})],
      ['0 tickets', () => ready()],
    ])('has no summary and no checkout while %s', (_name, setup) => {
      setup();
      const { result } = renderHook(() => OrderController(holdDeps() as never));
      expect(result.current.summary).toBeNull();
      expect(result.current.checkout).toBeNull();
    });

    it('has no summary and no checkout once the time is up', () => {
      vi.useFakeTimers({ now: new Date('2026-11-09T03:00:00Z') });
      answeredAt = Date.now();
      const { hook } = arrange(['cat_b']);
      expect(hook.result.current.checkout?.enabled).toBe(true);
      act(() => void vi.advanceTimersByTime(300_000));
      expect(hook.result.current.timeUp).toBe(true);
      expect(hook.result.current.summary).toBeNull();
      expect(hook.result.current.checkout).toBeNull();
    });

    it('is enabled with no hint once every holder is verified', () => {
      const { hook } = arrange();
      expect(hook.result.current.checkout).toEqual({
        label: 'order_checkout_label',
        shortLabel: 'order_checkout_short_label',
        enabled: true,
        busy: false,
        hint: null,
        onContinue: expect.any(Function),
      });
    });

    it('is disabled with the neutral holders hint until every holder is verified, and ignores a tap', () => {
      ready();
      const hook = renderHook(() => OrderController(holdDeps() as never));
      act(() => hook.result.current.increment('cat_b'));
      act(() => hook.result.current.increment('cat_b'));
      check(hook, 0, 'Nadia', NIK_A, valid('vt_0'));
      expect(hook.result.current.checkout).toMatchObject({
        enabled: false,
        busy: false,
        hint: { text: 'order_checkout_hint_holders', error: false },
      });
      tap(hook);
      expect(holdMutate).not.toHaveBeenCalled();
    });

    it('is busy, disabled and without a hint while the hold is in flight', () => {
      const { hook } = arrange();
      holdPending = true;
      hook.rerender();
      expect(hook.result.current.checkout).toMatchObject({ enabled: false, busy: true, hint: null });
      tap(hook);
      expect(holdMutate).not.toHaveBeenCalled();
    });

    it('sends the tickets in slot order with tokens and last 4 digits, once per double tap', () => {
      const { hook, d } = arrange(['cat_b', 'cat_t']);
      act(() => {
        hook.result.current.checkout?.onContinue();
        hook.result.current.checkout?.onContinue();
      });
      expect(holdMutate).toHaveBeenCalledTimes(1);
      expect(holdMutate).toHaveBeenCalledWith({
        eventId: 'evt_samudra',
        admissionToken: 'adm_token',
        idempotencyKey: 'uuid-1',
        tickets: [
          { categoryId: 'cat_b', validationToken: 'vt_0', nikLast4: '0004' },
          { categoryId: 'cat_t', validationToken: 'vt_1', nikLast4: '0001' },
        ],
        bookingId: null,
      });
      expect(d.admissionStore.get).toHaveBeenLastCalledWith('evt_samudra');
      expect(d.analyticsAdapter.trackEvent).not.toHaveBeenCalledWith('order_continue_tapped', expect.anything());
    });

    it('runs the use case with the loading overlay in all three paths', async () => {
      const { hook, d } = arrange();
      tap(hook);
      const input = lastInput();
      d.holdBookingUseCase.execute.mockResolvedValue({ kind: 'not-verified' });
      await expect((holdOptions.mutationFn as (i: HoldInput) => Promise<unknown>)(input)).resolves.toEqual({
        kind: 'not-verified',
      });
      expect(d.holdBookingUseCase.execute).toHaveBeenCalledWith(input);
      expect(toggleLoading).toHaveBeenCalledTimes(1);
      succeed({ kind: 'not-verified' });
      expect(toggleLoading).toHaveBeenCalledTimes(2);
      failWith({ status: 500, code: 'INTERNAL_ERROR' });
      expect(toggleLoading).toHaveBeenCalledTimes(3);
    });

    it('keeps the key and the booking after a retryable failure, and renews both for a new selection', () => {
      const { hook } = arrange();
      tap(hook);
      expect(lastInput()).toMatchObject({ idempotencyKey: 'uuid-1', bookingId: null });
      succeed({ kind: 'retryable', code: 'PAYMENT_PROVIDER_BUSY', bookingId: 'bk1', requestId: 'req-123' });
      tap(hook);
      expect(lastInput()).toMatchObject({ idempotencyKey: 'uuid-1', bookingId: 'bk1' });
      succeed({ kind: 'retryable', code: 'INTERNAL_ERROR', bookingId: 'bk1' });
      check(hook, 0, 'Nadia Putri', NIK_A, valid('vt_new'));
      tap(hook);
      expect(lastInput()).toMatchObject({ idempotencyKey: 'uuid-2', bookingId: null });
      expect(lastInput().tickets[0].validationToken).toBe('vt_new');
    });

    it('starts a new attempt after not-held', () => {
      const { hook } = arrange();
      tap(hook);
      succeed({ kind: 'retryable', code: 'INTERNAL_ERROR', bookingId: 'bk1' });
      tap(hook);
      succeed({ kind: 'not-held' });
      tap(hook);
      expect(lastInput()).toMatchObject({ idempotencyKey: 'uuid-2', bookingId: null });
    });

    it('lets the retry popup run the latest checkout handler', () => {
      const { hook } = arrange();
      tap(hook);
      succeed({ kind: 'retryable', code: 'PAYMENT_PROVIDER_BUSY', bookingId: 'bk1', requestId: 'req-123' });
      expect(openPopupError).toHaveBeenCalledWith({
        message: ERROR_CODE_MAP.PAYMENT_PROVIDER_BUSY,
        reference: 'req-123',
        actionLabel: 'action_retry',
        onAction: expect.any(Function),
      });
      const { onAction } = openPopupError.mock.calls[0][0] as { onAction: () => void };
      act(() => onAction());
      expect(holdMutate).toHaveBeenCalledTimes(2);
      expect(lastInput()).toMatchObject({ idempotencyKey: 'uuid-1', bookingId: 'bk1' });
    });

    it('goes to the payment page on held, stays busy and blocks every later redirect', () => {
      const { hook, d } = arrange();
      tap(hook);
      succeed({ kind: 'held', bookingId: 'bk1', resumed: false });
      expect(router.push).toHaveBeenCalledWith('/payment?booking=bk1');
      // Tracking plan §2 step 10: 2 × Rp 850.000 + the Rp 10.000 fee once per order.
      expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('begin_checkout', {
        event_id: 'evt_samudra',
        booking_id: 'bk1',
        currency: 'IDR',
        value: 1_710_000,
        items: [expect.objectContaining({ item_id: 'cat_b', item_name: 'Festival B', price: 850000, quantity: 2 })],
      });
      expect(webOnly(d)).toEqual([]);
      expect(hook.result.current.checkout).toMatchObject({ enabled: false, busy: true, hint: null });
      tap(hook);
      expect(holdMutate).toHaveBeenCalledTimes(1);
      categoriesState = { data: { kind: 'admission-invalid' } };
      hook.rerender();
      hook.rerender();
      expect(replace).not.toHaveBeenCalled();
      expect(openPopupError).not.toHaveBeenCalled();
    });

    it.each<[string, unknown, Record<string, unknown>, () => void]>([
      [
        'not-verified',
        { kind: 'not-verified' },
        { outcome: 'not-verified' },
        () => {
          expect(openPopupError).not.toHaveBeenCalled();
          expect(router.push).not.toHaveBeenCalled();
        },
      ],
      [
        'active-booking (selection)',
        { kind: 'active-booking', bookingId: 'bk9', status: 'SELECTION' },
        { outcome: 'active-booking', code: 'ACCOUNT_HAS_ACTIVE_BOOKING' },
        () => {
          expect(openPopupError).toHaveBeenCalledWith({ message: 'error_account_has_active_booking' });
          expect(router.push).not.toHaveBeenCalled();
        },
      ],
      [
        'active-booking (unknown)',
        { kind: 'active-booking', bookingId: null, status: null },
        { outcome: 'active-booking', code: 'ACCOUNT_HAS_ACTIVE_BOOKING' },
        () => expect(openPopupError).toHaveBeenCalledWith({ message: 'error_account_has_active_booking' }),
      ],
      [
        'not-held',
        { kind: 'not-held' },
        { outcome: 'not-held', code: 'BOOKING_NOT_HELD' },
        () => expect(openPopupError).toHaveBeenCalledWith({ message: 'error_booking_not_held' }),
      ],
      [
        'admission-invalid',
        { kind: 'admission-invalid' },
        { outcome: 'admission-invalid' },
        () => {
          expect(replace).toHaveBeenCalledTimes(1);
          expect(replace).toHaveBeenCalledWith('/queue?event=evt_samudra');
          expect(openPopupError).not.toHaveBeenCalled();
        },
      ],
      [
        'unauthorized',
        { kind: 'unauthorized' },
        { outcome: 'unauthorized' },
        () => {
          expect(router.push).toHaveBeenCalledWith(SIGN_IN);
          expect(openPopupError).not.toHaveBeenCalled();
        },
      ],
      [
        'retryable NETWORK_ERROR',
        { kind: 'retryable', code: 'NETWORK_ERROR', bookingId: null },
        { outcome: 'retryable', code: 'NETWORK_ERROR' },
        () =>
          expect(openPopupError).toHaveBeenCalledWith({
            message: 'error_network_error',
            reference: undefined,
            actionLabel: 'action_retry',
            onAction: expect.any(Function),
          }),
      ],
      [
        'retryable with an unmapped code',
        { kind: 'retryable', code: 'SOMETHING_NEW', bookingId: null, requestId: 'req-9' },
        { outcome: 'retryable', code: 'SOMETHING_NEW' },
        () =>
          expect(openPopupError).toHaveBeenCalledWith(
            expect.objectContaining({ message: ERROR_CODE_MAP.UNKNOWN_ERROR, reference: 'req-9' }),
          ),
      ],
    ])('handles %s', (_name, result, _params, expectEffect) => {
      const { hook, d } = arrange();
      tap(hook);
      succeed(result);
      expect(failed(d)).toEqual([]);
      expect(webOnly(d)).toEqual([]);
      expect(categoriesRefetch).not.toHaveBeenCalled();
      expectEffect();
      // Every outcome but held lets the buyer tap again.
      expect(hook.result.current.checkout?.busy).toBe(false);
    });

    it('admission-invalid redirects only once', () => {
      const { hook } = arrange();
      tap(hook);
      succeed({ kind: 'admission-invalid' });
      succeed({ kind: 'admission-invalid' });
      expect(replace).toHaveBeenCalledTimes(1);
    });

    it('offers the pending active booking and goes to its payment page', () => {
      const { hook } = arrange();
      tap(hook);
      succeed({ kind: 'active-booking', bookingId: 'bk9', status: 'PAYMENT_PENDING' });
      expect(openPopupError).toHaveBeenCalledWith({
        message: 'error_account_has_active_booking',
        actionLabel: 'order_hold_open_active',
        onAction: expect.any(Function),
      });
      const { onAction } = openPopupError.mock.calls[0][0] as { onAction: () => void };
      act(() => onAction());
      expect(router.push).toHaveBeenCalledWith('/payment?booking=bk9');
      expect(hook.result.current.checkout).toMatchObject({ enabled: false, busy: true });
      categoriesState = { data: { kind: 'admission-invalid' } };
      hook.rerender();
      expect(replace).not.toHaveBeenCalled();
    });

    it('marks a conflicting slot with the seat-taken field error and keeps the others', () => {
      const { hook, d } = arrange();
      tap(hook);
      succeed({ kind: 'nik-conflict', code: 'NIK_SEAT_TAKEN', slotIndexes: [1], bookingId: 'bk1' });
      expect(holder(hook, 0).nik.valid).toBe('order_nik_valid');
      expect(holder(hook, 1).nik.error).toBe('error_nik_seat_taken order_nik_use_another');
      expect(hook.result.current.allHoldersVerified).toBe(false);
      expect(hook.result.current.checkout?.hint).toEqual({ text: 'order_checkout_hint_holders', error: false });
      expect(failed(d)).toEqual([{ event_id: 'evt_samudra', reason: 'NIK_SEAT_TAKEN' }]);
      expect(openPopupError).not.toHaveBeenCalled();
    });

    it('marks a duplicate slot with the duplicate field error', () => {
      const { hook } = arrange();
      tap(hook);
      succeed({ kind: 'nik-conflict', code: 'DUPLICATE_NIK', slotIndexes: [0], bookingId: null });
      expect(holder(hook, 0).nik.error).toBe('error_duplicate_nik');
      expect(holder(hook, 1).nik.valid).toBe('order_nik_valid');
    });

    it.each<[string, unknown, string]>([
      [
        'nik-conflict without a slot',
        { kind: 'nik-conflict', code: 'NIK_SEAT_TAKEN', slotIndexes: [], bookingId: null },
        'NIK_SEAT_TAKEN',
      ],
      ['attendees-stale', { kind: 'attendees-stale' }, 'ATTENDEE_NOT_VALIDATED'],
    ])('%s asks every holder to recheck and says why', (_name, result, code) => {
      const { hook, d } = arrange();
      tap(hook);
      succeed(result);
      for (const i of [0, 1]) {
        expect(holder(hook, i).nik).toMatchObject({
          error: ERROR_CODE_MAP.ATTENDEE_NOT_VALIDATED,
          canRecheck: true,
          valid: undefined,
        });
      }
      expect(hook.result.current.checkout).toMatchObject({
        enabled: false,
        hint: { text: ERROR_CODE_MAP[code], error: true },
      });
      expect(failed(d)).toEqual(
        (result as { kind: string }).kind === 'nik-conflict' ? [{ event_id: 'evt_samudra', reason: code }] : [],
      );
      mutate.mockClear();
      act(() => holder(hook, 0).nik.recheck());
      expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ slotKey: 'cat_b-1', nik: NIK_A }));
    });

    it('flags a sold-out category, refreshes the categories and clears the flag once it is removed', () => {
      const { hook, d } = arrange(['cat_b', 'cat_t']);
      tap(hook);
      succeed({ kind: 'sold-out', categoryId: 'cat_b', bookingId: null });
      expect(categoriesRefetch).toHaveBeenCalledTimes(1);
      expect(hook.result.current.allHoldersVerified).toBe(true);
      expect(hook.result.current.checkout).toMatchObject({
        enabled: false,
        hint: { text: 'order_hold_sold_out:{"category":"Festival B"}', error: true },
      });
      expect(failed(d)).toEqual([]);
      act(() => hook.result.current.decrement('cat_b'));
      expect(hook.result.current.checkout).toMatchObject({ enabled: true, hint: null });
    });

    it('blocks with the generic sold-out message when the category is unknown', () => {
      const { hook } = arrange();
      tap(hook);
      succeed({ kind: 'sold-out', categoryId: null, bookingId: null });
      expect(hook.result.current.checkout).toMatchObject({
        enabled: false,
        hint: { text: ERROR_CODE_MAP.CATEGORY_SOLD_OUT, error: true },
      });
    });

    it('flags an over-reservation until the quantities change', () => {
      const { hook, d } = arrange(['cat_b', 'cat_t']);
      tap(hook);
      succeed({ kind: 'over-reservation', categoryId: null });
      expect(categoriesRefetch).toHaveBeenCalledTimes(1);
      expect(hook.result.current.checkout).toMatchObject({
        enabled: false,
        hint: { text: 'order_hold_over_reservation', error: true },
      });
      expect(failed(d)).toEqual([]);
      act(() => hook.result.current.decrement('cat_t'));
      expect(hook.result.current.checkout).toMatchObject({ enabled: true, hint: null });
    });

    it('sends a 401 from onError to sign-in', () => {
      const { hook, d } = arrange();
      tap(hook);
      failWith({ status: 401, code: 'UNAUTHORIZED' });
      expect(router.push).toHaveBeenCalledWith(SIGN_IN);
      expect(openPopupError).not.toHaveBeenCalled();
      expect(webOnly(d)).toEqual([]);
    });

    it.each([
      ['VALIDATION_FAILED', ERROR_CODE_MAP.VALIDATION_FAILED],
      ['SOMETHING_NEW', ERROR_CODE_MAP.UNKNOWN_ERROR],
    ])('maps a rethrown %s to a popup with the request id', (code, message) => {
      const { hook, d } = arrange();
      tap(hook);
      failWith({ status: 422, code, requestId: 'req-422' });
      expect(openPopupError).toHaveBeenCalledWith({ message, reference: 'req-422' });
      expect(router.push).not.toHaveBeenCalled();
      expect(d.analyticsAdapter.reportError).not.toHaveBeenCalled();
      tap(hook);
      expect(holdMutate).toHaveBeenCalledTimes(2);
    });

    describe('time up while holding', () => {
      const start = () => {
        vi.useFakeTimers({ now: new Date('2026-11-09T03:00:00Z') });
        answeredAt = Date.now();
        return arrange();
      };

      it('does not latch while the hold is in flight, then latches when it fails', () => {
        const { hook, d } = start();
        tap(hook);
        holdPending = true;
        hook.rerender();
        act(() => void vi.advanceTimersByTime(300_000));
        expect(hook.result.current.timer?.seconds).toBe(0);
        expect(hook.result.current.timeUp).toBe(false);
        expect(d.endOrderWindowUseCase.execute).not.toHaveBeenCalled();
        succeed({ kind: 'retryable', code: 'INTERNAL_ERROR', bookingId: null });
        holdPending = false;
        hook.rerender();
        expect(hook.result.current.timeUp).toBe(true);
        expect(d.endOrderWindowUseCase.execute).toHaveBeenCalledTimes(1);
      });

      it('never latches or ends the window after held', () => {
        const { hook, d } = start();
        tap(hook);
        holdPending = true;
        hook.rerender();
        succeed({ kind: 'held', bookingId: 'bk1', resumed: true });
        holdPending = false;
        hook.rerender();
        act(() => void vi.advanceTimersByTime(300_000));
        hook.rerender();
        expect(hook.result.current.timeUp).toBe(false);
        expect(hook.result.current.timeUpSheet).toBeNull();
        expect(d.endOrderWindowUseCase.execute).not.toHaveBeenCalled();
        expect(d.admissionStore.clear).not.toHaveBeenCalled();
      });
    });

    // The booking id is not personal data: the tracking plan sends it on begin_checkout (§2 step 10).
    it('never passes a name, NIK, last 4 digits or token to analytics', () => {
      const { hook, d } = arrange();
      tap(hook);
      succeed({ kind: 'retryable', code: 'INTERNAL_ERROR', bookingId: 'bk_secret' });
      tap(hook);
      succeed({ kind: 'nik-conflict', code: 'NIK_SEAT_TAKEN', slotIndexes: [0], bookingId: 'bk_secret' });
      failWith({ status: 500, code: 'INTERNAL_ERROR' });
      check(hook, 0, 'Nadia', NIK_C, valid('vt_2'));
      tap(hook);
      succeed({ kind: 'held', bookingId: 'bk_secret', resumed: false });
      const calls = JSON.stringify([
        d.analyticsAdapter.trackEvent.mock.calls,
        d.analyticsAdapter.trackPageView.mock.calls,
      ]);
      for (const secret of [
        NIK_A,
        NIK_B,
        NIK_C,
        'Nadia',
        'Sari',
        'vt_0',
        'vt_1',
        'vt_2',
        'adm_token',
        '0004',
        '0001',
      ]) {
        expect(calls).not.toContain(secret);
      }
      expect(d.analyticsAdapter.reportError).not.toHaveBeenCalled();
    });
  });
});
