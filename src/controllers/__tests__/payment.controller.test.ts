import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaymentView, SnapTransaction } from '@core/entities/payment/payment.entity';
import type {
  InactiveOutcome,
  PaymentPageResult,
  PaymentStep,
  PayResult,
} from '@core/use_case/payment/pay-booking.use-case';
import { ERROR_CODE_MAP } from '@utils/constants/error-codes';
import { formatRupiah } from '@utils/format/number';

import PaymentController, { type PaymentControllerInterface } from '../payment.controller';

const money = (amount: number) => ({ amount, currency: 'IDR' as const });

const S1: SnapTransaction = {
  snapToken: 'tok-secret-1',
  redirectUrl: 'https://snap.test/1',
  gatewayExpiresAt: '2026-11-13T03:10:00Z',
};
const S2: SnapTransaction = { ...S1, snapToken: 'tok-secret-2' };

const view: PaymentView = {
  bookingId: 'bk1',
  eventId: 'evt_samudra',
  orderCode: 'RSH-26-900001',
  eventName: 'Samudra',
  eventStartsAt: '2026-12-12T12:00:00Z',
  venueShort: 'GBK',
  timezone: 'Asia/Jakarta',
  attendees: [
    { categoryId: 'cat_fb', categoryName: 'Festival B', fullName: 'Nadia Putri', nikMasked: '3174 •••• •••• 0004' },
    { categoryId: 'cat_fb', categoryName: 'Festival B', fullName: 'Raka Putra', nikMasked: '3174 •••• •••• 0005' },
    { categoryId: 'cat_ta', categoryName: 'Tribun Atas', fullName: 'Sari Dewi', nikMasked: '3174 •••• •••• 0006' },
  ],
  customerEmail: 'nadia@example.com',
  price: {
    lines: [
      { categoryId: 'cat_fb', name: 'Festival B', quantity: 2, unitPrice: money(850000), lineTotal: money(1700000) },
      { categoryId: 'cat_ta', name: 'Tribun Atas', quantity: 1, unitPrice: money(450000), lineTotal: money(450000) },
    ],
    ticketSubtotal: money(2150000),
    adminFee: money(10000),
    total: money(2160000),
  },
  currentSnap: null,
  expiresAt: '2026-11-13T03:10:00Z',
  serverNow: '2026-11-13T03:00:00Z',
};

const ready = (v: PaymentView = view): PaymentPageResult => ({
  kind: 'ready',
  view: v,
  tickets: v.attendees.map(({ categoryId, categoryName, nikMasked }) => ({
    categoryId,
    categoryName,
    nikMasked,
    unitPrice: categoryId === 'cat_fb' ? 850000 : categoryId === 'cat_ta' ? 450000 : null,
  })),
});

const expiredOutcome = (overrides: Partial<InactiveOutcome> = {}): InactiveOutcome => ({
  kind: 'inactive',
  refund: false,
  reason: 'expired',
  eventId: 'evt_1',
  ticketCount: 3,
  ...overrides,
});
const otherOutcome = (overrides: Partial<InactiveOutcome> = {}): InactiveOutcome =>
  expiredOutcome({ reason: 'other', ...overrides });

interface QueryState {
  data?: unknown;
  isPending?: boolean;
  isError?: boolean;
  error?: { status: number; code: string; message: string; requestId?: string } | null;
  dataUpdatedAt?: number;
  isPlaceholderData?: boolean;
}

type Options = Record<string, unknown> & { queryKey: unknown[] };
type MutationOptions = {
  mutationFn: (input: unknown) => Promise<unknown>;
  onSuccess: (result: PayResult) => void;
  onError: (error: unknown) => void;
} & Record<string, unknown>;

describe('PaymentController', () => {
  let pageState: QueryState;
  let statusState: QueryState;
  let pageOptions: Options;
  let snapOptions: Options;
  let statusOptions: Options;
  let mutationOptions: MutationOptions;
  let payPending: boolean;
  let search: Record<string, string>;
  /** When the page answer "arrived": stable across renders, so the countdown anchors once (FR-21-W1). */
  let answeredAt: number;
  const pageRefetch = vi.fn();
  const mutate = vi.fn();
  const replace = vi.fn();
  const router = { replace, push: vi.fn() };
  const openPopupError = vi.fn();
  const changeLanguage = vi.fn();
  const i18n = { language: 'id', changeLanguage };
  const t = vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  );

  const deps = () => ({
    payBookingUseCase: {
      load: vi.fn().mockResolvedValue(ready()),
      pay: vi.fn().mockResolvedValue({ kind: 'snap', outcome: 'closed', snap: S1 }),
      checkStatus: vi.fn().mockResolvedValue({ kind: 'paid' }),
    },
    endOrderWindowUseCase: { execute: vi.fn(() => ({ kind: 'ended' })) },
    snap: { load: vi.fn().mockResolvedValue(undefined), pay: vi.fn() },
    analyticsAdapter: { trackPageView: vi.fn(), trackEvent: vi.fn(), reportError: vi.fn(), setUser: vi.fn() },
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    ERROR_CODE_MAP,
    useTranslation: () => ({ t, i18n }),
    useRouterNext: () => router,
    usePopupError: () => ({ openPopupError, closePopupError: vi.fn() }),
    useSearchParamsNext: () => ({ get: (key: string) => search[key] ?? null }),
    useMutationTanstack: (options: MutationOptions) => {
      mutationOptions = options;
      return { mutate, isPending: payPending };
    },
    useQueryTanstack: (options: Options) => {
      const base = { data: undefined, isPending: false, isError: false, error: null, dataUpdatedAt: 0 };
      if (options.queryKey[0] === 'payment') {
        pageOptions = options;
        return { ...base, dataUpdatedAt: answeredAt, refetch: pageRefetch, ...pageState };
      }
      if (options.queryKey[0] === 'snap-script') {
        snapOptions = options;
        return { ...base, refetch: vi.fn() };
      }
      statusOptions = options;
      return { ...base, refetch: vi.fn(), ...(options.enabled ? statusState : {}) };
    },
  });

  const render = (d = deps()) => {
    const hook = renderHook(() => PaymentController(d as never));
    return { ...hook, d };
  };
  const events = (d: ReturnType<typeof deps>, name: string) =>
    d.analyticsAdapter.trackEvent.mock.calls.filter((call: unknown[]) => call[0] === name).map((c) => c[1]);
  const succeed = (rerender: () => void, result: PayResult) => {
    act(() => mutationOptions.onSuccess(result));
    rerender();
  };
  const tap = (current: PaymentControllerInterface) => act(() => current.pay?.onPay());

  beforeEach(() => {
    vi.clearAllMocks();
    pageState = { data: ready() };
    statusState = {};
    payPending = false;
    search = { booking: 'bk1' };
    i18n.language = 'id';
    answeredAt = Date.now();
  });

  describe('load (Requirement 1)', () => {
    it('Property 1: no booking param is not-found without a call, every view but message null', () => {
      search = { booking: '  ' };
      pageState = { isPending: true };
      const { result } = render();
      expect(pageOptions.enabled).toBe(false);
      expect(result.current.state).toBe('not-found');
      expect(result.current.message).toMatchObject({
        title: 'payment_not_found_title',
        body: 'payment_not_found_body',
        note: null,
        actionLabel: null,
        onAction: null,
        homeHref: '/',
        homeLabel: 'action_back_home',
      });
      const { intro, summary, pay, notice, progress } = result.current;
      expect([intro, summary, pay, notice, progress]).toEqual([null, null, null, null, null]);
    });

    it('loads through the use case once, without retry or focus refetch, and tracks the page view', async () => {
      const { d } = render();
      expect(pageOptions).toMatchObject({
        queryKey: ['payment', 'bk1'],
        enabled: true,
        retry: false,
        refetchOnWindowFocus: false,
      });
      await expect((pageOptions.queryFn as () => Promise<unknown>)()).resolves.toEqual(ready());
      expect(d.payBookingUseCase.load).toHaveBeenCalledWith('bk1');
      expect(d.analyticsAdapter.trackPageView).toHaveBeenCalledTimes(1);
      expect(d.analyticsAdapter.trackPageView).toHaveBeenCalledWith('payment');
    });

    it('is loading while the query loads', () => {
      pageState = { isPending: true };
      const { result } = render();
      expect(result.current.state).toBe('loading');
      expect(result.current.summary).toBeNull();
      expect(result.current.message).toBeNull();
    });

    it('Property 2: inactive with and without the refund note', () => {
      pageState = { data: otherOutcome({ refund: true }) };
      const { result, rerender } = render();
      expect(result.current.state).toBe('inactive');
      expect(result.current.message).toMatchObject({
        title: 'payment_inactive_title',
        body: 'payment_inactive_body',
        note: 'payment_inactive_refund',
      });
      pageState = { data: otherOutcome() };
      rerender();
      expect(result.current.message?.note).toBeNull();
    });

    it('Property 2: not-found from the use case', () => {
      pageState = { data: { kind: 'not-found' } };
      expect(render().result.current.state).toBe('not-found');
    });

    it('Property 2: paid replaces the page with the e-ticket, without a purchase (no view to price it)', () => {
      pageState = { data: { kind: 'paid' } };
      const { result, d, rerender } = render();
      rerender();
      expect(result.current.state).toBe('leaving');
      expect(result.current.progress).toEqual({
        reason: 'paid',
        title: 'payment_paid_title',
        body: 'payment_paid_body',
        held: '',
      });
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith('/tickets/detail?booking=bk1');
      expect(events(d, 'purchase')).toEqual([]);
    });

    it.each([
      ['an unauthorized result', { data: { kind: 'unauthorized' } }],
      ['a 401', { isError: true, error: { status: 401, code: 'UNAUTHORIZED', message: 'raw' } }],
    ])('Property 2: %s goes to sign-in once', (_, state) => {
      pageState = state as QueryState;
      const { result, rerender } = render();
      rerender();
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith('/login?next=%2Fpayment%3Fbooking%3Dbk1');
      expect(result.current.state).toBe('loading');
    });

    it('Property 2: a rejected load shows the mapped error and a retry that refetches', () => {
      pageState = { isError: true, error: { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'raw' } };
      const { result } = render();
      expect(result.current.state).toBe('error');
      expect(result.current.message).toMatchObject({
        title: 'payment_error_title',
        body: 'error_service_unavailable',
        actionLabel: 'action_retry',
      });
      result.current.message?.onAction?.();
      expect(pageRefetch).toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
    });

    it('maps an unknown load error code to the fallback', () => {
      pageState = { isError: true, error: { status: 500, code: 'WHATEVER', message: 'raw' } };
      expect(render().result.current.message?.body).toBe('error_unknown_error');
    });
  });

  describe('snap preload (Property 9)', () => {
    it('is enabled only with a ready view, never stale, and returns true', async () => {
      const { d } = render();
      expect(snapOptions).toMatchObject({
        queryKey: ['snap-script'],
        enabled: true,
        staleTime: Infinity,
        retry: false,
      });
      await expect((snapOptions.queryFn as () => Promise<boolean>)()).resolves.toBe(true);
      expect(d.snap.load).toHaveBeenCalled();
    });

    it('is disabled without a view, and its failure changes nothing visible', async () => {
      pageState = { isPending: true };
      render();
      expect(snapOptions.enabled).toBe(false);
      pageState = { data: ready() };
      const d = deps();
      d.snap.load.mockRejectedValue({ code: 'SNAP_UNAVAILABLE' });
      const { result } = render(d);
      await expect((snapOptions.queryFn as () => Promise<boolean>)()).rejects.toMatchObject({
        code: 'SNAP_UNAVAILABLE',
      });
      expect(result.current.state).toBe('ready');
      expect(result.current.notice).toBeNull();
    });
  });

  describe('pay (Requirement 2)', () => {
    it('runs one mutation around the use case without retry or overlay', async () => {
      const { d } = render();
      expect(mutationOptions).toMatchObject({ mutationKey: ['payment-pay'], retry: false });
      const input = { bookingId: 'bk1', eventId: 'evt_samudra', reusable: null };
      await mutationOptions.mutationFn(input);
      expect(d.payBookingUseCase.pay).toHaveBeenCalledWith(input);
      expect(d).not.toHaveProperty('useLoading');
    });

    it('Property 3: first tap reopens the current snap; closed keeps it', () => {
      pageState = { data: ready({ ...view, currentSnap: S1 }) };
      const { result, rerender } = render();
      tap(result.current);
      expect(mutate).toHaveBeenLastCalledWith({ bookingId: 'bk1', eventId: 'evt_samudra', reusable: S1 });
      succeed(rerender, { kind: 'snap', outcome: 'closed', snap: S1 });
      expect(result.current.state).toBe('ready');
      tap(result.current);
      expect(mutate).toHaveBeenLastCalledWith({ bookingId: 'bk1', eventId: 'evt_samudra', reusable: S1 });
    });

    it('Property 3: retryable without a snap asks enterPayment again', () => {
      const { result, rerender } = render();
      tap(result.current);
      expect(mutate).toHaveBeenLastCalledWith({ bookingId: 'bk1', eventId: 'evt_samudra', reusable: null });
      succeed(rerender, { kind: 'retryable', code: 'PAYMENT_PROVIDER_BUSY', snap: null });
      tap(result.current);
      expect(mutate).toHaveBeenLastCalledWith({ bookingId: 'bk1', eventId: 'evt_samudra', reusable: null });
      succeed(rerender, { kind: 'retryable', code: 'SNAP_UNAVAILABLE', snap: S2 });
      tap(result.current);
      expect(mutate).toHaveBeenLastCalledWith({ bookingId: 'bk1', eventId: 'evt_samudra', reusable: S2 });
    });

    it('Property 3: a failed step renews the attempt (nothing to reopen)', () => {
      const { result, rerender } = render();
      tap(result.current);
      succeed(rerender, { kind: 'snap', outcome: 'error', snap: S1 });
      statusState = { data: { kind: 'failed', paymentStatus: 'denied' } satisfies PaymentStep, dataUpdatedAt: 10 };
      rerender();
      rerender();
      expect(result.current.state).toBe('failed');
      tap(result.current);
      expect(mutate).toHaveBeenLastCalledWith({ bookingId: 'bk1', eventId: 'evt_samudra', reusable: null });
    });

    it('Property 3: two taps before a render call mutate once; the guard lifts on settle', () => {
      const { result, rerender } = render();
      act(() => {
        result.current.pay?.onPay();
        result.current.pay?.onPay();
      });
      expect(mutate).toHaveBeenCalledTimes(1);
      act(() => mutationOptions.onError({ status: 422, code: 'VALIDATION_FAILED', message: 'raw' }));
      rerender();
      tap(result.current);
      expect(mutate).toHaveBeenCalledTimes(2);
    });

    it('ignores a tap while pending and without a view', () => {
      payPending = true;
      const { result } = render();
      expect(result.current.state).toBe('opening');
      expect(result.current.pay).toMatchObject({ busy: true, enabled: false, busyLabel: 'payment_pay_busy' });
      tap(result.current);
      expect(mutate).not.toHaveBeenCalled();
    });

    it.each([
      ['success', 'confirming'],
      ['pending', 'waiting'],
      ['error', 'confirming'],
    ] as const)('Property 4/6: snap %s verifies (%s) and never leaves or tracks purchase', (outcome, reason) => {
      const { result, rerender, d } = render();
      tap(result.current);
      succeed(rerender, { kind: 'snap', outcome, snap: S1 });
      expect(result.current.state).toBe('verifying');
      expect(result.current.progress?.reason).toBe(reason);
      expect(statusOptions.queryKey.slice(0, 3)).toEqual(['payment-status', 'bk1', outcome]);
      expect(replace).not.toHaveBeenCalled();
      expect(events(d, 'purchase')).toEqual([]);
    });

    it('Property 6: snap closed goes back to ready without a poll', () => {
      const { result, rerender, d } = render();
      tap(result.current);
      succeed(rerender, { kind: 'snap', outcome: 'closed', snap: S1 });
      expect(result.current.state).toBe('ready');
      expect(statusOptions.enabled).toBe(false);
      expect(replace).not.toHaveBeenCalled();
      expect(events(d, 'purchase')).toEqual([]);
    });

    it('Property 4: paid result leaves for the e-ticket and tracks purchase once', () => {
      const { result, rerender, d } = render();
      tap(result.current);
      succeed(rerender, { kind: 'paid' });
      rerender();
      expect(result.current.state).toBe('leaving');
      expect(result.current.summary).not.toBeNull();
      expect(result.current.pay).toBeNull();
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith('/tickets/detail?booking=bk1');
      expect(events(d, 'purchase')).toHaveLength(1);
    });

    it('Property 4: inactive, not-found and unauthorized results', () => {
      const { result, rerender } = render();
      succeed(rerender, otherOutcome({ refund: true, eventId: null, ticketCount: null }));
      expect(result.current.state).toBe('inactive');
      expect(result.current.message?.note).toBe('payment_inactive_refund');

      const second = render();
      succeed(second.rerender, { kind: 'not-found' });
      expect(second.result.current.state).toBe('not-found');

      const third = render();
      succeed(third.rerender, { kind: 'unauthorized' });
      expect(replace).toHaveBeenCalledWith('/login?next=%2Fpayment%3Fbooking%3Dbk1');
    });

    it.each([
      'PAYMENT_PROVIDER_BUSY',
      'NETWORK_ERROR',
      'TIMEOUT',
      'INTERNAL_ERROR',
      'SERVICE_UNAVAILABLE',
      'SNAP_UNAVAILABLE',
      'UNKNOWN_ERROR',
    ])('Property 4: retryable %s shows the mapped busy notice and "Coba lagi"', (code) => {
      expect(ERROR_CODE_MAP[code]).toBeDefined();
      const { result, rerender } = render();
      succeed(rerender, { kind: 'retryable', code, snap: null });
      expect(result.current.state).toBe('busy');
      expect(result.current.notice).toEqual({ text: ERROR_CODE_MAP[code], tone: 'error' });
      expect(result.current.pay).toMatchObject({ label: 'action_retry', dockLabel: 'action_retry', enabled: true });
    });

    it('maps an unknown retryable code to the fallback', () => {
      const { result, rerender } = render();
      succeed(rerender, { kind: 'retryable', code: 'NEW_CODE', snap: null });
      expect(result.current.notice?.text).toBe('error_unknown_error');
    });

    it('Property 4: onError opens the mapped popup with the reference and keeps the phase', () => {
      const { result, rerender } = render();
      act(() =>
        mutationOptions.onError({ status: 422, code: 'VALIDATION_FAILED', message: 'raw', requestId: 'req-1' }),
      );
      rerender();
      expect(openPopupError).toHaveBeenCalledWith({ message: 'error_validation_failed', reference: 'req-1' });
      expect(result.current.state).toBe('ready');
      act(() => mutationOptions.onError({ status: 500, code: 'ODD', message: 'raw' }));
      expect(openPopupError).toHaveBeenLastCalledWith({ message: 'error_unknown_error', reference: undefined });
    });

    it.each([
      { status: 401, code: 'UNAUTHORIZED' },
      { status: 401, code: 'OTHER' },
      { status: 0, code: 'UNAUTHORIZED' },
    ])('Property 4: onError $status/$code goes to sign-in', (error) => {
      render();
      act(() => mutationOptions.onError({ ...error, message: 'raw' }));
      expect(replace).toHaveBeenCalledWith('/login?next=%2Fpayment%3Fbooking%3Dbk1');
      expect(openPopupError).not.toHaveBeenCalled();
    });
  });

  describe('status poll (Requirement 3)', () => {
    const verify = (outcome: 'success' | 'pending' | 'error' = 'success') => {
      const hook = render();
      tap(hook.result.current);
      succeed(hook.rerender, { kind: 'snap', outcome, snap: S1 });
      return hook;
    };

    it('Property 5: enabled only while verifying, every 4 s, with the hint in the key', async () => {
      const { result, rerender, d } = render();
      expect(statusOptions.enabled).toBe(false);
      tap(result.current);
      succeed(rerender, { kind: 'snap', outcome: 'pending', snap: S1 });
      expect(statusOptions).toMatchObject({
        enabled: true,
        refetchInterval: 4000,
        refetchOnWindowFocus: true,
        retry: false,
      });
      expect(statusOptions.queryKey.slice(0, 3)).toEqual(['payment-status', 'bk1', 'pending']);
      await (statusOptions.queryFn as () => Promise<unknown>)();
      expect(d.payBookingUseCase.checkStatus).toHaveBeenCalledWith('bk1', 'evt_samudra', 'pending');
    });

    it('gives every verifying stretch a fresh query key', () => {
      const { result, rerender } = verify('pending');
      const first = statusOptions.queryKey;
      succeed(rerender, { kind: 'snap', outcome: 'closed', snap: S1 });
      tap(result.current);
      succeed(rerender, { kind: 'snap', outcome: 'pending', snap: S1 });
      expect(statusOptions.queryKey).not.toEqual(first);
    });

    it('Property 5: paid leaves for the e-ticket and tracks purchase once', () => {
      const { result, rerender, d } = verify();
      statusState = { data: { kind: 'paid' }, dataUpdatedAt: 5 };
      rerender();
      rerender();
      rerender();
      expect(result.current.state).toBe('leaving');
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith('/tickets/detail?booking=bk1');
      expect(events(d, 'purchase')).toEqual([
        {
          transaction_id: 'bk1',
          booking_id: 'bk1',
          currency: 'IDR',
          value: 2160000,
          items: [
            { item_id: 'cat_fb', item_name: 'Festival B', price: 850000, quantity: 2 },
            { item_id: 'cat_ta', item_name: 'Tribun Atas', price: 450000, quantity: 1 },
          ],
        },
      ]);
    });

    it('Property 5: verifying steps update the reason and keep polling', () => {
      const { result, rerender } = verify('success');
      expect(result.current.pay).toBeNull();
      statusState = { data: { kind: 'verifying', reason: 'waiting' }, dataUpdatedAt: 5 };
      rerender();
      expect(result.current.state).toBe('verifying');
      expect(result.current.progress).toEqual({
        reason: 'waiting',
        title: 'payment_waiting_title',
        body: 'payment_waiting_body',
        held: 'payment_verifying_held',
      });
      expect(result.current.pay).toMatchObject({ label: 'payment_pay_reopen', dockLabel: 'payment_pay_reopen' });
      expect(statusOptions.enabled).toBe(true);
      statusState = { data: { kind: 'verifying', reason: 'waiting' }, dataUpdatedAt: 9 };
      rerender();
      expect(result.current.progress?.reason).toBe('waiting');
    });

    it('Property 5: failed shows "Bayar lagi" and tracks payment_failed per failure', () => {
      const { result, rerender, d } = verify('error');
      statusState = { data: { kind: 'failed', paymentStatus: 'none' }, dataUpdatedAt: 5 };
      rerender();
      rerender();
      expect(result.current.state).toBe('failed');
      expect(statusOptions.enabled).toBe(false);
      expect(result.current.notice).toEqual({ text: 'payment_failed', tone: 'error' });
      expect(result.current.intro).not.toBeNull();
      expect(result.current.pay).toMatchObject({ label: 'payment_pay_again', dockLabel: 'payment_pay_again' });
      expect(events(d, 'payment_failed')).toEqual([{ booking_id: 'bk1', reason: 'none' }]);

      tap(result.current);
      succeed(rerender, { kind: 'snap', outcome: 'success', snap: S2 });
      statusState = { data: { kind: 'failed', paymentStatus: 'denied' }, dataUpdatedAt: 8 };
      rerender();
      rerender();
      expect(events(d, 'payment_failed')).toEqual([
        { booking_id: 'bk1', reason: 'none' },
        { booking_id: 'bk1', reason: 'denied' },
      ]);
    });

    it('Property 5: inactive shows the no-longer-active message with the refund', () => {
      const { result, rerender } = verify();
      statusState = { data: otherOutcome({ refund: true }), dataUpdatedAt: 5 };
      rerender();
      expect(result.current.state).toBe('inactive');
      expect(result.current.message?.note).toBe('payment_inactive_refund');
      expect(result.current.summary).toBeNull();
    });

    it('Property 5: a poll 401 goes to sign-in; other poll errors are ignored', () => {
      const { result, rerender } = verify();
      statusState = { isError: true, error: { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'raw' } };
      rerender();
      expect(result.current.state).toBe('verifying');
      expect(replace).not.toHaveBeenCalled();
      expect(openPopupError).not.toHaveBeenCalled();
      statusState = { isError: true, error: { status: 401, code: 'UNAUTHORIZED', message: 'raw' } };
      rerender();
      rerender();
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith('/login?next=%2Fpayment%3Fbooking%3Dbk1');
    });
  });

  describe('views (Requirement 4, Property 7)', () => {
    it('ready: steps, intro, summary and pay in Indonesian', () => {
      const { result } = render();
      const c = result.current;
      expect(c.state).toBe('ready');
      expect(c.title).toBe('payment_title');
      expect(c.homeHref).toBe('/');
      expect(c.backHref).toBe('/');
      expect(c.steps).toEqual([
        { number: 1, label: 'order_step_choose', current: false, done: true },
        { number: 2, label: 'order_step_pay', current: true, done: false },
        { number: 3, label: 'order_step_ticket', current: false, done: false },
      ]);
      expect(c.intro).toEqual({
        heading: 'payment_heading',
        body: 'payment_intro',
        note: 'payment_intro_note',
      });
      expect(c.summary).toEqual({
        heading: 'payment_summary_heading',
        orderCode: 'RSH-26-900001',
        eventLine: 'SAMUDRA · Sab, 12 Des 2026 · GBK',
        lines: [
          {
            key: '0',
            category: 'Festival B',
            nik: 'payment_summary_nik:{"nik":"3174 •••• •••• 0004"}',
            amount: 'Rp 850.000',
          },
          {
            key: '1',
            category: 'Festival B',
            nik: 'payment_summary_nik:{"nik":"3174 •••• •••• 0005"}',
            amount: 'Rp 850.000',
          },
          {
            key: '2',
            category: 'Tribun Atas',
            nik: 'payment_summary_nik:{"nik":"3174 •••• •••• 0006"}',
            amount: 'Rp 450.000',
          },
        ],
        feeLabel: 'order_summary_fee',
        fee: 'Rp 10.000',
        totalLabel: 'order_summary_total',
        total: 'Rp 2.160.000',
        legal: 'payment_legal',
      });
      expect(c.pay).toMatchObject({
        label: 'payment_pay_label',
        dockLabel: 'payment_pay_amount:{"amount":"Rp 2.160.000"}',
        dockRegionLabel: 'payment_dock_label',
        busyLabel: 'payment_pay_busy',
        busy: false,
        enabled: true,
      });
      expect(c.notice).toBeNull();
      expect(c.progress).toBeNull();
      expect(c.message).toBeNull();
      expect(c.timer?.label).toBe('payment_timer_label');
      expect(c.timer?.seconds).toBeGreaterThanOrEqual(599);
      expect(c.timer?.seconds).toBeLessThanOrEqual(600);
      expect(c.timeUp).toBe(false);
      expect(c).not.toHaveProperty('secondsLeft');
    });

    it('formats the summary in English', () => {
      i18n.language = 'en';
      const { result } = render();
      expect(result.current.locale).toBe('en');
      expect(result.current.summary?.eventLine).toBe('SAMUDRA · Sat, 12 Dec 2026 · GBK');
      expect(result.current.summary?.total).toBe('Rp 2,160,000');
      expect(result.current.summary?.lines[0].amount).toBe('Rp 850,000');
    });

    it('leaves out missing event parts and unknown prices', () => {
      const bare: PaymentView = {
        ...view,
        eventName: undefined,
        eventStartsAt: undefined,
        venueShort: 'GBK',
        attendees: [{ ...view.attendees[0], categoryId: 'cat_x' }],
      };
      pageState = { data: ready(bare) };
      const { result } = render();
      expect(result.current.summary?.eventLine).toBe('GBK');
      expect(result.current.summary?.lines[0].amount).toBe('');
    });

    it('keeps the fee once per order for 1-3 tickets', () => {
      for (const count of [1, 2, 3]) {
        pageState = { data: ready({ ...view, attendees: view.attendees.slice(0, count) }) };
        expect(render().result.current.summary?.fee).toBe('Rp 10.000');
      }
    });

    it('verifying confirming shows progress without pay or intro', () => {
      const { result, rerender } = render();
      succeed(rerender, { kind: 'snap', outcome: 'success', snap: S1 });
      expect(result.current.intro).toBeNull();
      expect(result.current.pay).toBeNull();
      expect(result.current.summary).not.toBeNull();
      expect(result.current.progress).toEqual({
        reason: 'confirming',
        title: 'payment_verifying_title',
        body: 'payment_verifying_body',
        held: 'payment_verifying_held',
      });
    });

    it('switches the language and stores it', () => {
      const { result } = render();
      result.current.setLocale('en');
      expect(changeLanguage).toHaveBeenCalledWith('en');
    });
  });

  describe('analytics (Requirement 5, Property 8)', () => {
    it('tracks add_payment_info once per attempt, with no personal data or token', () => {
      const { result, rerender, d } = render();
      tap(result.current);
      succeed(rerender, { kind: 'snap', outcome: 'closed', snap: S1 });
      tap(result.current);
      succeed(rerender, { kind: 'snap', outcome: 'pending', snap: S1 });
      succeed(rerender, { kind: 'snap', outcome: 'closed', snap: S2 });
      const sent = events(d, 'add_payment_info');
      expect(sent).toEqual([
        {
          booking_id: 'bk1',
          currency: 'IDR',
          value: 2160000,
          payment_type: 'midtrans_snap',
          items: [
            { item_id: 'cat_fb', item_name: 'Festival B', price: 850000, quantity: 2 },
            { item_id: 'cat_ta', item_name: 'Tribun Atas', price: 450000, quantity: 1 },
          ],
        },
        expect.objectContaining({ booking_id: 'bk1' }),
      ]);
      const all = JSON.stringify(d.analyticsAdapter.trackEvent.mock.calls);
      for (const secret of ['Nadia', 'Raka', '3174', 'tok-secret', 'nadia@example.com', 'RSH-26']) {
        expect(all).not.toContain(secret);
      }
    });
  });

  describe('payment countdown (FR-21-W1)', () => {
    const START = new Date('2026-11-13T03:00:00Z');
    const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));

    beforeEach(() => {
      vi.useFakeTimers({ now: START });
      answeredAt = Date.now();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      ['a correct device clock', '2026-11-13T03:00:00Z'],
      ['a clock ten hours behind', '2026-11-12T17:00:00Z'],
      ['a clock in 2031', '2031-06-01T09:30:00Z'],
    ])('Property 1: 600 s from server time with %s', (_name, device) => {
      vi.setSystemTime(new Date(device));
      answeredAt = Date.now();
      const { result } = render();
      expect(result.current.timer).toEqual({ seconds: 600, label: 'payment_timer_label' });
      expect(result.current.timeUp).toBe(false);
    });

    it('Property 2: ticks every second, whole and never increasing, and stores no deadline', () => {
      const { result, d } = render();
      expect(vi.getTimerCount()).toBe(1);
      let last = result.current.timer?.seconds ?? Infinity;
      for (let i = 0; i < 48; i += 1) {
        tick(1000);
        const seconds = result.current.timer?.seconds ?? NaN;
        expect(Number.isInteger(seconds)).toBe(true);
        expect(seconds).toBeGreaterThanOrEqual(0);
        expect(seconds).toBeLessThanOrEqual(last);
        last = seconds;
      }
      expect(result.current.timer?.seconds).toBe(552);
      result.current.setLocale('en');
      expect(JSON.stringify(d.storage.set.mock.calls)).not.toContain(view.expiresAt);
    });

    it.each([
      [30000, 570],
      [30400, 569],
    ])('Property 3: an answer that arrived %i ms before mount starts at %i', (ago, seconds) => {
      answeredAt = Date.now() - ago;
      const { result } = render();
      expect(result.current.timer?.seconds).toBe(seconds);
    });

    it('Property 4: at zero the timer stays 0, the clock stops and "Bayar" does nothing', () => {
      const { result } = render();
      tick(600000);
      expect(result.current.timer).toEqual({ seconds: 0, label: 'payment_timer_label' });
      expect(result.current.timeUp).toBe(true);
      expect(result.current.pay?.enabled).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      tap(result.current);
      expect(mutate).not.toHaveBeenCalled();
      tick(10000);
      expect(result.current.timer?.seconds).toBe(0);
      expect(result.current.timeUp).toBe(true);
      expect(pageRefetch).toHaveBeenCalledTimes(1);
    });

    it('Property 5: an answer already past its deadline is time up at once, without a clock', () => {
      pageState = { data: ready({ ...view, expiresAt: '2026-11-13T02:59:00Z' }) };
      const { result } = render();
      expect(result.current.timer?.seconds).toBe(0);
      expect(result.current.timeUp).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      expect(pageRefetch).toHaveBeenCalledTimes(1);
    });

    it('Properties 6-8, 10: zero asks the server once per edge; inactive, then a re-anchor; expired tracked once', () => {
      const { result, rerender, d } = render();
      tick(600000);
      rerender();
      rerender();
      expect(pageRefetch).toHaveBeenCalledTimes(1);
      expect(result.current.state).toBe('ready');
      expect(result.current.message).toBeNull();
      expect(replace).not.toHaveBeenCalled();
      expect(openPopupError).not.toHaveBeenCalled();
      expect(events(d, 'payment_expired')).toEqual([{ booking_id: 'bk1' }]);

      pageState = { data: otherOutcome() };
      rerender();
      expect(result.current.state).toBe('inactive');
      expect(result.current.timer).toBeNull();
      expect(result.current.timeUp).toBe(false);
      expect(result.current.message).toMatchObject({ title: 'payment_inactive_title', note: null });

      pageState = { data: ready({ ...view, serverNow: '2026-11-13T03:09:50Z' }), dataUpdatedAt: Date.now() };
      rerender();
      expect(result.current.state).toBe('ready');
      expect(result.current.timer?.seconds).toBe(10);
      expect(result.current.timeUp).toBe(false);
      expect(result.current.pay?.enabled).toBe(true);
      expect(vi.getTimerCount()).toBe(1);

      tick(10000);
      expect(result.current.timeUp).toBe(true);
      expect(pageRefetch).toHaveBeenCalledTimes(2);
      expect(events(d, 'payment_expired')).toEqual([{ booking_id: 'bk1' }]);
    });

    it('Property 7: a paid answer after zero leaves for the e-ticket', () => {
      const { result, rerender } = render();
      tick(600000);
      pageState = { data: { kind: 'paid' } };
      rerender();
      expect(result.current.state).toBe('leaving');
      expect(result.current.timer).toBeNull();
      expect(result.current.timeUp).toBe(false);
      expect(replace).toHaveBeenCalledWith('/tickets/detail?booking=bk1');
    });

    it('Property 9: verifying keeps polling at zero and a paid step still leaves', () => {
      const { result, rerender } = render();
      tap(result.current);
      succeed(rerender, { kind: 'snap', outcome: 'success', snap: S1 });
      tick(600000);
      expect(result.current.state).toBe('verifying');
      expect(result.current.timeUp).toBe(true);
      expect(statusOptions).toMatchObject({ enabled: true, refetchInterval: 4000 });
      statusState = { data: { kind: 'paid' }, dataUpdatedAt: 5 };
      rerender();
      rerender();
      expect(result.current.state).toBe('leaving');
      expect(replace).toHaveBeenCalledWith('/tickets/detail?booking=bk1');
    });

    it('Requirement 4: placeholder data does not move the anchor', () => {
      const { result, rerender } = render();
      tick(5000);
      pageState = {
        data: ready({ ...view, serverNow: '2026-11-13T03:05:00Z' }),
        dataUpdatedAt: Date.now(),
        isPlaceholderData: true,
      };
      rerender();
      expect(result.current.timer?.seconds).toBe(595);
    });

    it.each<[string, () => void, boolean]>([
      ['loading', () => (pageState = { isPending: true }), false],
      ['inactive', () => (pageState = { data: otherOutcome({ refund: true }) }), false],
      ['not-found', () => (pageState = { data: { kind: 'not-found' } }), false],
      ['not-found', () => (search = {}), false],
      [
        'error',
        () =>
          (pageState = {
            data: ready(),
            isError: true,
            error: { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'raw' },
          }),
        false,
      ],
      ['leaving', () => (pageState = { data: { kind: 'paid' } }), false],
      ['ready', () => undefined, true],
      ['opening', () => (payPending = true), true],
    ])('Property 11: %s has a timer: %s', (state, arrange, shown) => {
      arrange();
      const { result } = render();
      expect(result.current.state).toBe(state);
      expect(result.current.timer !== null).toBe(shown);
      expect(result.current.timeUp).toBe(false);
    });

    it('Property 11: verifying, failed and busy show the timer; inactive and leaving from a pay result do not', () => {
      const { result, rerender } = render();
      succeed(rerender, { kind: 'snap', outcome: 'success', snap: S1 });
      expect(result.current.state).toBe('verifying');
      expect(result.current.timer?.seconds).toBe(600);
      statusState = { data: { kind: 'failed', paymentStatus: 'denied' }, dataUpdatedAt: 5 };
      rerender();
      expect(result.current.state).toBe('failed');
      expect(result.current.timer).not.toBeNull();
      succeed(rerender, { kind: 'retryable', code: 'PAYMENT_PROVIDER_BUSY', snap: null });
      expect(result.current.state).toBe('busy');
      expect(result.current.timer).not.toBeNull();
      succeed(rerender, otherOutcome({ eventId: null, ticketCount: null }));
      expect(result.current.state).toBe('inactive');
      expect(result.current.timer).toBeNull();

      const other = render();
      succeed(other.rerender, { kind: 'paid' });
      expect(other.result.current.state).toBe('leaving');
      expect(other.result.current.timer).toBeNull();
      expect(other.result.current.timeUp).toBe(false);
    });

    it.each<[string, Partial<PaymentView>]>([
      ['an unparseable expiresAt', { expiresAt: 'soon' }],
      ['an empty serverNow', { serverNow: '' }],
      ['a missing expiresAt', { expiresAt: undefined as unknown as string }],
      ['a missing serverNow', { serverNow: undefined as unknown as string }],
    ])('Property 12: %s gives no timer, no clock and a usable "Bayar"', (_name, patch) => {
      pageState = { data: ready({ ...view, ...patch }) };
      const { result } = render();
      expect(result.current.timer).toBeNull();
      expect(result.current.timeUp).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      expect(result.current.pay?.enabled).toBe(true);
      expect(pageRefetch).not.toHaveBeenCalled();
    });

    it('Property 13: unmounting while counting clears the clock', () => {
      const { unmount } = render();
      expect(vi.getTimerCount()).toBe(1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
  describe('payment expired (FR-23-W1)', () => {
    const START = new Date('2026-11-13T03:00:00Z');
    const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
    const hidden = (current: PaymentControllerInterface) => {
      const { timer, timeUp, intro, pay, notice, progress, message } = current;
      expect({ timer, timeUp, intro, pay, notice, progress, message }).toEqual({
        timer: null,
        timeUp: false,
        intro: null,
        pay: null,
        notice: null,
        progress: null,
        message: null,
      });
    };

    it('Property 1: a first load that is already expired gives the full expired view and no summary', () => {
      pageState = { data: expiredOutcome() };
      const { result } = render();
      expect(result.current.state).toBe('expired');
      expect(result.current.summary).toBeNull();
      hidden(result.current);
      expect(result.current.expired).toEqual({
        stamp: 'payment_expired_stamp',
        title: 'payment_expired_title',
        body: 'payment_expired_body:{"count":3}',
        noteLead: 'payment_expired_note_lead',
        note: 'payment_expired_note_account',
        queueAgainLabel: 'payment_expired_queue_again',
        onQueueAgain: expect.any(Function),
        homeHref: '/',
        homeLabel: 'action_back_home',
      });
      expect(pageRefetch).not.toHaveBeenCalled();
      expect(statusOptions.enabled).toBe(false);
      expect(snapOptions.enabled).toBe(false);
    });

    describe('after the countdown', () => {
      beforeEach(() => {
        vi.useFakeTimers({ now: START });
        answeredAt = Date.now();
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      it('Property 2: zero → refetch → expired keeps the seen order and tracks payment_expired once', () => {
        const { result, rerender, d } = render();
        tick(600000);
        expect(pageRefetch).toHaveBeenCalledTimes(1);
        pageState = { data: expiredOutcome(), dataUpdatedAt: Date.now() };
        rerender();
        rerender();
        expect(result.current.state).toBe('expired');
        hidden(result.current);
        expect(result.current.summary?.orderCode).toBe('RSH-26-900001');
        expect(result.current.summary?.lines).toHaveLength(3);
        expect(result.current.summary?.total).toBe(formatRupiah(2160000, 'id'));
        expect(result.current.expired?.note).toBe('payment_expired_note_email:{"email":"nadia@example.com"}');
        expect(vi.getTimerCount()).toBe(0);
        expect(pageRefetch).toHaveBeenCalledTimes(1);
        expect(events(d, 'payment_expired')).toEqual([{ booking_id: 'bk1' }]);
        expect(replace).not.toHaveBeenCalled();
        expect(d.endOrderWindowUseCase.execute).not.toHaveBeenCalled();
      });

      it('Property 5: getBooking failed after zero: the count comes from the seen order, no "Antre lagi"', () => {
        pageState = { data: ready({ ...view, attendees: view.attendees.slice(0, 2) }) };
        const { result, rerender } = render();
        tick(600000);
        pageState = { data: expiredOutcome({ eventId: null, ticketCount: null }), dataUpdatedAt: Date.now() };
        rerender();
        expect(result.current.expired?.body).toBe('payment_expired_body:{"count":2}');
        expect(result.current.expired?.onQueueAgain).toBeNull();
        expect(result.current.summary).not.toBeNull();
      });
    });

    it('Property 3: a pay result and a status step both reach expired and stop polling', () => {
      const first = render();
      succeed(first.rerender, expiredOutcome());
      expect(first.result.current.state).toBe('expired');
      expect(first.result.current.summary?.orderCode).toBe('RSH-26-900001');
      expect(first.result.current.pay).toBeNull();
      expect(first.result.current.expired?.body).toBe('payment_expired_body:{"count":3}');

      const second = render();
      tap(second.result.current);
      succeed(second.rerender, { kind: 'snap', outcome: 'success', snap: S1 });
      expect(statusOptions.enabled).toBe(true);
      statusState = { data: expiredOutcome() satisfies PaymentStep, dataUpdatedAt: 5 };
      second.rerender();
      second.rerender();
      expect(second.result.current.state).toBe('expired');
      expect(statusOptions.enabled).toBe(false);
      hidden(second.result.current);
      expect(second.result.current.expired).not.toBeNull();
    });

    it('Property 4: reason other stays inactive with the existing message', () => {
      pageState = { data: otherOutcome() };
      const { result } = render();
      expect(result.current.state).toBe('inactive');
      expect(result.current.expired).toBeNull();
      expect(result.current.message).toMatchObject({ title: 'payment_inactive_title', note: null });
    });

    it('ready and the other states have no expired view', () => {
      expect(render().result.current.expired).toBeNull();
      pageState = { data: { kind: 'not-found' } };
      expect(render().result.current.expired).toBeNull();
    });

    it('Property 5: the body uses ticketCount, else the seen order, else the count-free text', () => {
      pageState = { data: expiredOutcome({ ticketCount: null }) };
      expect(render().result.current.expired?.body).toBe('payment_expired_body_unknown');

      pageState = { data: ready() };
      const { result, rerender } = render();
      pageState = { data: expiredOutcome({ ticketCount: null }) };
      rerender();
      expect(result.current.expired?.body).toBe('payment_expired_body:{"count":3}');

      pageState = { data: expiredOutcome({ ticketCount: 0 }) };
      expect(render().result.current.expired?.body).toBe('payment_expired_body_unknown');
    });

    it('Property 6: the refund note, the seen e-mail and the account fallback', () => {
      pageState = { data: expiredOutcome({ refund: true }) };
      const refunded = render().result.current.expired;
      expect(refunded?.noteLead).toBeNull();
      expect(refunded?.note).toBe('payment_inactive_refund');

      pageState = { data: ready() };
      const withEmail = render();
      pageState = { data: expiredOutcome() };
      withEmail.rerender();
      expect(withEmail.result.current.expired?.noteLead).toBe('payment_expired_note_lead');
      expect(t).toHaveBeenCalledWith('payment_expired_note_email', { email: 'nadia@example.com' });

      pageState = { data: ready({ ...view, customerEmail: '  ' }) };
      const blank = render();
      pageState = { data: expiredOutcome() };
      blank.rerender();
      expect(blank.result.current.expired?.note).toBe('payment_expired_note_account');
    });

    it('Property 7: "Antre lagi" forgets the turn, tracks queue_rejoin, then replaces the page, once', () => {
      pageState = { data: expiredOutcome() };
      const { result, d } = render();
      act(() => result.current.expired?.onQueueAgain?.());
      expect(d.endOrderWindowUseCase.execute).toHaveBeenCalledWith('evt_1');
      expect(events(d, 'queue_rejoin')).toEqual([{ eventId: 'evt_1', from: 'payment' }]);
      expect(replace).toHaveBeenCalledWith('/queue?event=evt_1');
      const executed = d.endOrderWindowUseCase.execute.mock.invocationCallOrder[0];
      const tracked = d.analyticsAdapter.trackEvent.mock.invocationCallOrder.at(-1) ?? 0;
      const replaced = replace.mock.invocationCallOrder[0];
      expect(executed).toBeLessThan(tracked);
      expect(tracked).toBeLessThan(replaced);

      act(() => result.current.expired?.onQueueAgain?.());
      expect(d.endOrderWindowUseCase.execute).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledTimes(1);
      expect(events(d, 'queue_rejoin')).toHaveLength(1);

      pageState = { data: expiredOutcome({ eventId: null }) };
      expect(render().result.current.expired?.onQueueAgain).toBeNull();
    });

    it('Property 8: showing expired forgets nothing, navigates nowhere and never tracks the e-mail', () => {
      const { result, rerender, d } = render();
      pageState = { data: expiredOutcome() };
      rerender();
      rerender();
      expect(result.current.state).toBe('expired');
      expect(d.endOrderWindowUseCase.execute).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      expect(events(d, 'payment_expired')).toEqual([]);
      act(() => result.current.expired?.onQueueAgain?.());
      const all = JSON.stringify(d.analyticsAdapter.trackEvent.mock.calls);
      for (const secret of ['nadia@example.com', 'Nadia', '3174', 'RSH-26', 'tok-secret']) {
        expect(all).not.toContain(secret);
      }
    });
  });
});
