import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { Frontier } from '@core/entities/queue/queue.entity';
import type { HomeEvents } from '@core/use_case/catalog/get-home-events.use-case';
import type { JoinedPlace, JoinQueueResult } from '@core/use_case/queue/join-queue.use-case';

import QueueController from '../queue.controller';

const NOW = '2026-11-09T03:00:00Z';
const pelita: EventSummary = {
  eventId: 'evt_pelita',
  name: 'Pelita',
  subtitle: 'Tur Kota Lama',
  venue: 'Lapangan Simpang Lima',
  venueShort: 'Simpang Lima',
  city: 'Semarang',
  timezone: 'Asia/Jakarta',
  startsAt: '2026-12-04T12:30:00Z',
  state: 'almost_gone',
};
const rimba: EventSummary = { ...pelita, eventId: 'evt_rimba', name: 'Rimba', state: 'temporarily_full' };
const EVENTS = { featured: pelita, others: [rimba], total: 2, serverNow: NOW } as HomeEvents;

const place = (extra: Partial<JoinedPlace> = {}): JoinQueueResult => ({
  kind: 'joined',
  resumed: false,
  place: {
    eventId: 'evt_pelita',
    state: 'open',
    seq: 19700,
    served: 18452,
    joinedServed: 17400,
    position: 1248,
    progress: 45.7,
    opensAt: null,
    turnExpiresAt: null,
    serverNow: NOW,
    ...extra,
  },
});

const frontier = (patch: Partial<Frontier> = {}) => ({
  kind: 'frontier' as const,
  frontier: {
    event: 'evt_pelita',
    state: 'open' as const,
    served: 18452,
    ratePerMin: 300,
    ts: 1,
    ...patch,
  },
});

interface QueryState {
  data?: unknown;
  isError?: boolean;
  error?: { status: number; code: string; message: string } | null;
  dataUpdatedAt?: number;
  isSuccess?: boolean;
}

describe('QueueController', () => {
  let joinOptions: Record<string, unknown>;
  let eventsOptions: Record<string, unknown>;
  let meOptions: Record<string, unknown>;
  let frontierOptions: Record<string, unknown>;
  let frontierState: QueryState;
  let claimOptions: Record<string, unknown>;
  let claimState: QueryState;
  let windowOptions: Record<string, unknown>;
  let windowState: QueryState;
  let visible: boolean;
  const router = { replace: vi.fn(), push: vi.fn() };
  let joinState: QueryState;
  let eventsState: QueryState;
  let meState: QueryState;
  const meRefetch = vi.fn();
  let search: string;
  const refetch = vi.fn();
  let leaveMutation: Record<string, (...args: never[]) => unknown>;
  const leaveMutate = vi.fn();
  let leavePending: boolean;
  const toggleLoading = vi.fn();
  const openPopupError = vi.fn();
  const changeLanguage = vi.fn();
  const i18n = { language: 'id', changeLanguage };
  const t = vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  );
  const deps = () => ({
    accountService: { getMe: vi.fn().mockResolvedValue({ data: { userId: 'usr_1' }, status: 200 }) },
    joinQueueUseCase: { execute: vi.fn().mockResolvedValue('joined') },
    followQueueUseCase: {
      poll: vi.fn().mockResolvedValue('frontier'),
    },
    claimTurnUseCase: {
      execute: vi.fn().mockResolvedValue('claimed'),
      turnWindow: vi.fn().mockResolvedValue('window'),
    },
    useRouterNext: () => router,
    usePageVisible: () => visible,
    leaveQueueUseCase: { execute: vi.fn().mockResolvedValue({ kind: 'left' }) },
    useMutationTanstack: (options: Record<string, (...args: never[]) => unknown>) => {
      leaveMutation = options;
      return { mutate: leaveMutate, isPending: leavePending };
    },
    useLoading: () => ({ isLoading: false, toggleLoading }),
    usePopupError: () => ({ openPopupError, closePopupError: vi.fn() }),
    getHomeEventsUseCase: { execute: vi.fn().mockResolvedValue('events') },
    analyticsAdapter: { trackPageView: vi.fn(), trackEvent: vi.fn(), reportError: vi.fn(), setUser: vi.fn() },
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    ERROR_CODE_MAP: { RATE_LIMITED: 'error_rate_limited', UNKNOWN_ERROR: 'error_unknown_error' },
    useTranslation: () => ({ t, i18n }),
    useSearchParamsNext: () => new URLSearchParams(search),
    useQueryTanstack: (options: { queryKey: unknown[] } & Record<string, unknown>) => {
      const key = options.queryKey[0] as string;
      const slots: Record<string, [(o: Record<string, unknown>) => void, () => QueryState]> = {
        'queue-frontier': [(o) => (frontierOptions = o), () => frontierState],
        'queue-place': [(o) => (joinOptions = o), () => joinState],
        'queue-claim': [(o) => (claimOptions = o), () => claimState],
        'queue-turn': [(o) => (windowOptions = o), () => windowState],
        me: [(o) => (meOptions = o), () => ({ refetch: meRefetch, ...meState })],
      };
      const [capture, read] = slots[key] ?? [(o) => (eventsOptions = o), () => eventsState];
      capture(options);
      const state = read();
      return { data: undefined, isError: false, isSuccess: false, error: null, refetch, dataUpdatedAt: 0, ...state };
    },
  });

  const render = (d = deps()) => renderHook(() => QueueController(d as never));

  beforeEach(() => {
    vi.clearAllMocks();
    search = 'event=evt_pelita';
    leavePending = false;
    joinState = {};
    frontierState = {};
    claimState = {};
    windowState = {};
    visible = true;
    eventsState = { data: EVENTS };
    meState = { data: { userId: 'usr_1' }, isSuccess: true };
    i18n.language = 'id';
  });

  afterEach(() => vi.useRealTimers());

  it('joins once per visit through the use case, with no automatic retries or refetches', async () => {
    const d = deps();
    const { result } = render(d);
    expect(result.current.status).toBe('joining');
    expect(joinOptions).toMatchObject({
      queryKey: ['queue-place', 'evt_pelita'],
      enabled: true,
      staleTime: Infinity,
      gcTime: 0,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });
    await expect((joinOptions.queryFn as () => Promise<unknown>)()).resolves.toBe('joined');
    expect(d.joinQueueUseCase.execute).toHaveBeenCalledWith('evt_pelita', { rejoin: false });
  });

  describe('sign in before the queue', () => {
    it('reads the profile as the session check, once, without retries', async () => {
      const d = deps();
      render(d);
      expect(meOptions).toMatchObject({ queryKey: ['me'], enabled: true, retry: false, refetchOnWindowFocus: false });
      await expect((meOptions.queryFn as () => Promise<unknown>)()).resolves.toEqual({ userId: 'usr_1' });
      expect(d.accountService.getMe).toHaveBeenCalledOnce();
    });

    it('sends a guest to sign in and back, without joining', () => {
      meState = { isError: true, error: { status: 401, code: 'UNAUTHORIZED', message: '' } };
      const { result } = render();
      expect(router.replace).toHaveBeenCalledWith('/login?next=%2Fqueue%3Fevent%3Devt_pelita');
      expect(joinOptions.enabled).toBe(false);
      expect(result.current.status).toBe('joining');
      expect(result.current.errorMessage).toBe('');
    });

    it('waits for the session check before joining', () => {
      meState = {};
      const { result } = render();
      expect(joinOptions.enabled).toBe(false);
      expect(result.current.status).toBe('joining');
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('shows the error when the check fails for another reason, and retries the check', () => {
      meState = { isError: true, error: { status: 0, code: 'NETWORK_ERROR', message: '' } };
      const { result } = render();
      expect(result.current.status).toBe('error');
      expect(result.current.errorMessage).toBe('error_unknown_error');
      expect(joinOptions.enabled).toBe(false);
      result.current.retry();
      expect(meRefetch).toHaveBeenCalledOnce();
      expect(refetch).not.toHaveBeenCalled();
    });
  });

  it('reads the event from the Home list query, sharing its cache', async () => {
    const d = deps();
    render(d);
    expect(eventsOptions).toMatchObject({ queryKey: ['events'], staleTime: 5000, enabled: true });
    await expect((eventsOptions.queryFn as () => Promise<unknown>)()).resolves.toBe('events');
  });

  it('asks for an event when the link has none, without calling anything', () => {
    search = '';
    const { result } = render();
    expect(result.current.status).toBe('no-event');
    expect(joinOptions.enabled).toBe(false);
    expect(eventsOptions.enabled).toBe(false);
  });

  it('shows the place: position, progress and both numbers, formatted', () => {
    joinState = { data: place(), dataUpdatedAt: Date.now() };
    const { result } = render();
    expect(result.current.status).toBe('waiting');
    expect(result.current.waiting).toEqual({
      position: '1.248',
      progress: 45.7,
      served: '18.452',
      seq: '19.700',
      updated: 'queue_updated_now',
      rate: null,
      eta: null,
    });
    expect(result.current.event).toMatchObject({
      name: 'Pelita',
      kicker: 'queue_kicker_open',
      posterPlace: 'SIMPANG LIMA · SEMARANG',
      venueLine: 'Lapangan Simpang Lima, Semarang',
    });
    expect(result.current.prequeue).toBeNull();
    expect(result.current.paused).toBeNull();
  });

  it('formats numbers for English too', () => {
    i18n.language = 'en';
    joinState = { data: place() };
    const { result } = render();
    expect(result.current.waiting?.position).toBe('1,248');
    expect(result.current.locale).toBe('en');
  });

  it('counts down to the draw from server time plus the time since the answer', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    joinState = {
      data: place({ state: 'preopen', seq: null, served: null, position: null, opensAt: '2026-11-09T03:08:42Z' }),
      dataUpdatedAt: 1_000_000,
    };
    const { result } = render();
    expect(result.current.status).toBe('prequeue');
    expect(result.current.prequeue).toEqual({ countdown: '8:42', opensAt: '10.08 WIB' });
    expect(result.current.event?.kicker).toBe('queue_kicker_prequeue:{"time":"10.08 WIB"}');
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.prequeue?.countdown).toBe('8:40');
  });

  it('asks again once when the countdown ends, to get the drawn number', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    joinState = {
      data: place({ state: 'preopen', seq: null, served: null, position: null, opensAt: '2026-11-09T03:00:01Z' }),
      dataUpdatedAt: 1_000_000,
    };
    render();
    expect(refetch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(3000));
    expect(refetch).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(3000));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows a pre-sale place without an opening time plainly', () => {
    joinState = { data: place({ state: 'open', seq: null, served: null, position: null }) };
    const { result } = render();
    expect(result.current.status).toBe('prequeue');
    expect(result.current.prequeue).toBeNull();
  });

  it('explains a pause by the event state: stock coming back, or the organiser', () => {
    search = 'event=evt_rimba';
    joinState = { data: place({ eventId: 'evt_rimba', state: 'paused' }) };
    const { result } = render();
    expect(result.current.status).toBe('paused');
    expect(result.current.paused).toEqual({ position: '1.248', reason: 'home_temporarily_full_note' });
    expect(result.current.event?.kicker).toBe('queue_kicker_paused');

    search = 'event=evt_pelita';
    joinState = { data: place({ state: 'paused', seq: null, served: null, position: null }) };
    const other = render();
    expect(other.result.current.paused).toEqual({ position: null, reason: 'queue_paused_operator' });
  });

  it.each([
    [{ kind: 'sold-out' }, 'sold-out'],
    [{ kind: 'not-found' }, 'not-found'],
    [{ kind: 'elsewhere' }, 'elsewhere'],
  ] as const)('shows %o as %s', (data, status) => {
    joinState = { data };
    const { result } = render();
    expect(result.current.status).toBe(status);
  });

  it('treats a closed queue in the answer as sold out', () => {
    joinState = { data: place({ state: 'closed' }) };
    const { result } = render();
    expect(result.current.status).toBe('sold-out');
    expect(result.current.event?.kicker).toBe('queue_kicker_closed');
  });

  it('translates failures and retries on request', () => {
    joinState = { isError: true, error: { status: 429, code: 'RATE_LIMITED', message: 'x' } };
    const { result } = render();
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('error_rate_limited');
    result.current.retry();
    expect(refetch).toHaveBeenCalledTimes(1);

    joinState = { isError: true, error: { status: 0, code: 'SOMETHING_NEW', message: 'x' } };
    expect(render().result.current.errorMessage).toBe('error_unknown_error');
  });

  it('works without the event list (not listed, or not loaded yet)', () => {
    eventsState = {};
    joinState = { data: place() };
    const { result } = render();
    expect(result.current.status).toBe('waiting');
    expect(result.current.event).toBeNull();
  });

  it('tracks the page view once and each join outcome once', () => {
    const d = deps();
    joinState = { data: place() };
    const { rerender } = render(d);
    rerender();
    expect(d.analyticsAdapter.trackPageView).toHaveBeenCalledTimes(1);
    expect(d.analyticsAdapter.trackPageView).toHaveBeenCalledWith('queue');
    expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledTimes(1);
    expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('queue_join', {
      event_id: 'evt_pelita',
      outcome: 'joined',
      position_bucket: '1001-10000',
    });
  });

  it('switches language and remembers it; marks the queue tab current', () => {
    const d = deps();
    const { result } = render(d);
    result.current.setLocale('en');
    expect(d.storage.set).toHaveBeenCalledWith('rusuh.lang', 'en');
    expect(changeLanguage).toHaveBeenCalledWith('en');
    expect(result.current.nav.find((item) => item.current)?.icon).toBe('queue');
    expect(result.current.homeHref).toBe('/');
  });

  describe('live updates (FR-07)', () => {
    type IntervalState = { data: unknown; dataUpdatedAt: number; errorUpdatedAt: number; errorUpdateCount: number };
    const interval = (dataUpdatedAt = 500, errors: Partial<IntervalState> = {}) =>
      (frontierOptions.refetchInterval as (q: { state: IntervalState }) => number | false)({
        state: { data: frontierState.data, dataUpdatedAt, errorUpdatedAt: 0, errorUpdateCount: 0, ...errors },
      });

    it('polls the frontier after the join, every 2–10 s by distance, with jitter fixed per answer', async () => {
      const d = deps();
      joinState = { data: place() };
      render(d);
      expect(frontierOptions).toMatchObject({
        queryKey: ['queue-frontier', 'evt_pelita'],
        enabled: true,
        retry: false,
      });
      expect(interval()).toBe(5000);
      expect(interval(1_000_000)).toBe(4000);
      expect(interval(1_000_999)).toBe(5998);
      expect(interval(1_000_999)).toBe(interval(1_000_999));
      frontierState = { data: frontier({ served: 19000 }) };
      expect(interval()).toBe(2000);
      await expect((frontierOptions.queryFn as () => Promise<unknown>)()).resolves.toBe('frontier');
      expect(d.followQueueUseCase.poll).toHaveBeenCalledWith('evt_pelita');
    });

    it('does not poll before the draw', () => {
      joinState = { data: place({ state: 'preopen', seq: null, served: null, position: null }) };
      render();
      expect(frontierOptions.enabled).toBe(false);
    });

    it('moves the number and the track with the frontier, and shows the admit rate', () => {
      joinState = { data: place() };
      frontierState = { data: frontier({ served: 18952 }) };
      const { result } = render();
      expect(result.current.waiting).toMatchObject({
        position: '748',
        served: '18.952',
        rate: 'queue_rate:{"rate":"300"}',
      });
    });

    it('says how long ago it was updated, ticking every second', () => {
      vi.useFakeTimers({ now: 1_000_000 });
      joinState = { data: place(), dataUpdatedAt: 990_000 };
      frontierState = { data: frontier(), dataUpdatedAt: 998_000 };
      const { result } = render();
      expect(result.current.waiting?.updated).toBe('queue_updated:{"seconds":2}');
      act(() => vi.advanceTimersByTime(3000));
      expect(result.current.waiting?.updated).toBe('queue_updated:{"seconds":5}');
    });

    it('pauses and closes with the frontier, giving its reason', () => {
      joinState = { data: place() };
      frontierState = { data: frontier({ state: 'paused', reason: 'operator', ratePerMin: 0 }) };
      const paused = render();
      expect(paused.result.current.status).toBe('paused');
      expect(paused.result.current.paused?.reason).toBe('queue_paused_operator');

      frontierState = { data: frontier({ state: 'paused', reason: 'stock' }) };
      expect(render().result.current.paused?.reason).toBe('home_temporarily_full_note');

      frontierState = { data: frontier({ state: 'closed', reason: 'sold_out' }) };
      const closed = render();
      expect(closed.result.current.status).toBe('sold-out');
      expect(interval()).toBe(false);
    });

    it('stops polling at the turn, and the turn view takes over', () => {
      joinState = { data: place() };
      frontierState = { data: frontier({ served: 19700 }) };
      const { result } = render();
      expect(result.current.status).toBe('turn');
      expect(result.current.waiting).toBeNull();
      expect(interval()).toBe(false);
    });

    it('keeps polling near the front: no stream, even when the frontier offers one (SSE dropped)', () => {
      joinState = { data: place() };
      frontierState = { data: frontier({ served: 19600, streamFrom: 2000 }) };
      const d = deps();
      render(d);
      expect(frontierOptions.enabled).toBe(true);
      expect(interval()).toEqual(expect.any(Number));
      expect(Object.keys(d.followQueueUseCase)).toEqual(['poll']);
    });
  });

  describe('turn (FR-08)', () => {
    const atTurn = () => {
      joinState = { data: place() };
      frontierState = { data: frontier({ served: 19700 }) };
    };

    it('claims at the turn while the page is in front, and reads the 60 s window', async () => {
      atTurn();
      const d = deps();
      const { result } = render(d);
      expect(result.current.status).toBe('turn');
      expect(result.current.turn).toEqual({ seq: '19.700', seconds: null, claiming: true, signInHref: null });
      expect(claimOptions).toMatchObject({
        queryKey: ['queue-claim', 'evt_pelita', 19700],
        enabled: true,
        retry: 3,
        staleTime: Infinity,
      });
      const delay = claimOptions.retryDelay as (attempt: number) => number;
      expect([0, 1, 2].map(delay)).toEqual([1000, 2000, 4000]);
      expect(windowOptions).toMatchObject({ queryKey: ['queue-turn', 'evt_pelita', 19700], enabled: true });
      await expect((claimOptions.queryFn as () => Promise<unknown>)()).resolves.toBe('claimed');
      await expect((windowOptions.queryFn as () => Promise<unknown>)()).resolves.toBe('window');
      expect(d.claimTurnUseCase.execute).toHaveBeenCalledWith('evt_pelita');
    });

    it('waits in a background tab, and claims nothing before the turn', () => {
      atTurn();
      visible = false;
      const { result } = render();
      expect(claimOptions.enabled).toBe(false);
      expect(result.current.turn?.claiming).toBe(false);

      visible = true;
      joinState = { data: place() };
      frontierState = { data: frontier() };
      render();
      expect(claimOptions.enabled).toBe(false);
      expect(windowOptions.enabled).toBe(false);
    });

    it('goes on to the order page once admitted, replacing the waiting room', () => {
      atTurn();
      claimState = { data: { kind: 'admitted', admission: { admissionToken: 'adm' } } };
      const d = deps();
      render(d);
      expect(router.replace).toHaveBeenCalledWith('/order?event=evt_pelita');
      expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('queue_claim', {
        event_id: 'evt_pelita',
        outcome: 'admitted',
      });
    });

    it('claims again after the retry delay, and on "Pilih tiket sekarang"', () => {
      atTurn();
      const { result } = render();
      const interval = claimOptions.refetchInterval as (q: { state: { data: unknown } }) => number | false;
      expect(interval({ state: { data: { kind: 'retry', afterMs: 1500 } } })).toBe(1500);
      expect(interval({ state: { data: { kind: 'sign-in' } } })).toBe(false);
      result.current.claimNow();
      expect(refetch).toHaveBeenCalled();
    });

    it('sends a guest to sign in, and back to this queue', () => {
      atTurn();
      claimState = { data: { kind: 'sign-in' } };
      const d = deps();
      const { result } = render(d);
      expect(result.current.turn).toMatchObject({
        claiming: false,
        signInHref: '/login?next=%2Fqueue%3Fevent%3Devt_pelita',
      });
      // Sign-in comes before the claim: not a claim outcome.
      expect(d.analyticsAdapter.trackEvent).not.toHaveBeenCalledWith('queue_claim', expect.anything());
    });

    it('counts the 60 s down from server time, and misses the turn at 0', () => {
      vi.useFakeTimers({ now: 1_000_000 });
      atTurn();
      visible = false;
      windowState = {
        data: { kind: 'window', turnExpiresAt: '2026-11-09T03:01:00Z', serverNow: '2026-11-09T03:00:08Z' },
        dataUpdatedAt: 1_000_000,
      };
      const { result } = render();
      expect(result.current.turn?.seconds).toBe(52);
      act(() => vi.advanceTimersByTime(50_000));
      expect(result.current.turn?.seconds).toBe(2);
      act(() => vi.advanceTimersByTime(3000));
      expect(result.current.status).toBe('missed');
      expect(result.current.turn).toBeNull();
    });

    it.each([
      [{ kind: 'missed' }, 'missed'],
      [{ kind: 'paused' }, 'paused'],
      [{ kind: 'sold-out' }, 'sold-out'],
    ] as const)('shows the claim answer %o as %s', (data, status) => {
      atTurn();
      claimState = { data };
      expect(render().result.current.status).toBe(status);
    });

    it('misses or closes from the window answer too', () => {
      atTurn();
      windowState = { data: { kind: 'missed' } };
      expect(render().result.current.status).toBe('missed');
      windowState = { data: { kind: 'sold-out' } };
      expect(render().result.current.status).toBe('sold-out');
    });

    it('reports a sold-out turn once as sold_out_seen and its claim outcome', () => {
      atTurn();
      claimState = { data: { kind: 'sold-out' } };
      const d = deps();
      const { rerender } = render(d);
      rerender();
      expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('queue_claim', {
        event_id: 'evt_pelita',
        outcome: 'sold_out',
      });
      const soldOut = d.analyticsAdapter.trackEvent.mock.calls.filter(([name]) => name === 'sold_out_seen');
      expect(soldOut).toEqual([['sold_out_seen', { event_id: 'evt_pelita', where: 'queue' }]]);
    });

    it('queues again at the back after a missed turn', () => {
      atTurn();
      claimState = { data: { kind: 'missed' } };
      const d = deps();
      const { result } = render(d);
      result.current.queueAgain();
      expect(refetch).toHaveBeenCalled();
      expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('queue_claim', {
        event_id: 'evt_pelita',
        outcome: 'missed',
      });
      expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('queue_rejoin', {
        event_id: 'evt_pelita',
        reason: 'missed',
      });
    });
  });

  describe('wait estimate (FR-09)', () => {
    it('shows the range from the frontier speed, one number when it meets, "soon" near the front', () => {
      joinState = { data: place() };
      frontierState = { data: frontier({ rateLow: 240, rateHigh: 360 }) };
      expect(render().result.current.waiting?.eta).toBe('queue_eta_range:{"low":3,"high":6}');

      frontierState = { data: frontier({ rateLow: 300, rateHigh: 300, served: 18500 }) };
      expect(render().result.current.waiting?.eta).toBe('queue_eta_single:{"minutes":4}');

      frontierState = { data: frontier({ rateLow: 240, rateHigh: 360, served: 19600 }) };
      expect(render().result.current.waiting?.eta).toBe('queue_eta_soon');
    });

    it('shows none without a speed', () => {
      joinState = { data: place() };
      frontierState = { data: frontier({ rateLow: 0, rateHigh: 0, ratePerMin: 0 }) };
      expect(render().result.current.waiting?.eta).toBeNull();
    });

    it('holds a small rise for the same number, and starts over for a new one', () => {
      joinState = { data: place({ served: 13700, joinedServed: 13000 }) };
      frontierState = { data: frontier({ served: 13700, rateLow: 240, rateHigh: 360 }) }; // 6.000 back: 15–25
      const { result, rerender } = render();
      expect(result.current.waiting?.eta).toBe('queue_eta_range:{"low":15,"high":25}');
      frontierState = { data: frontier({ served: 13700, rateLow: 220, rateHigh: 360 }) }; // 15–30: +20%, held
      rerender();
      expect(result.current.waiting?.eta).toBe('queue_eta_range:{"low":15,"high":25}');
      frontierState = { data: frontier({ served: 13700, rateLow: 150, rateHigh: 360 }) }; // 15–40: +60%, shown
      rerender();
      expect(result.current.waiting?.eta).toBe('queue_eta_range:{"low":15,"high":40}');

      joinState = { data: place({ seq: 19750, served: 13700, joinedServed: 13000 }) };
      frontierState = { data: frontier({ served: 13700, rateLow: 220, rateHigh: 360 }) };
      rerender();
      expect(result.current.waiting?.eta).toBe('queue_eta_range:{"low":15,"high":30}');
    });
  });

  describe('resume (FR-10)', () => {
    it('shows the missed view when a refresh finds the turn passed', () => {
      joinState = { data: { kind: 'missed' } };
      expect(render().result.current.status).toBe('missed');
    });

    it('tracks a resumed place as resumed', () => {
      const d = deps();
      joinState = { data: { ...place(), resumed: true } };
      render(d);
      expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('queue_join', {
        event_id: 'evt_pelita',
        outcome: 'resumed',
        position_bucket: '1001-10000',
      });
    });

    it('rejoins at the back on "Antre lagi" only, then resumes again', async () => {
      const d = deps();
      joinState = { data: { kind: 'missed' } };
      const { result } = render(d);
      result.current.queueAgain();
      const run = joinOptions.queryFn as () => Promise<unknown>;
      await run();
      expect(d.joinQueueUseCase.execute).toHaveBeenLastCalledWith('evt_pelita', { rejoin: true });
      await run();
      expect(d.joinQueueUseCase.execute).toHaveBeenLastCalledWith('evt_pelita', { rejoin: false });
    });
  });

  describe('no queue (FR-05)', () => {
    const noQueue = () => {
      joinState = { data: place({ served: 19700, position: 1, progress: 0 }) };
    };

    it('goes straight on when the join answer is already at the turn: no turn screen, no window read', () => {
      noQueue();
      const d = deps();
      const { result } = render(d);
      expect(result.current.status).toBe('entering');
      expect(result.current.turn).toBeNull();
      expect(claimOptions.enabled).toBe(true);
      expect(windowOptions.enabled).toBe(false);
      expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('queue_join', {
        event_id: 'evt_pelita',
        outcome: 'no_queue',
        position_bucket: '1-100',
      });
      // No queue, so no turn to report.
      expect(d.analyticsAdapter.trackEvent).not.toHaveBeenCalledWith('queue_turn', expect.anything());
    });

    it('moves on to the order page once admitted', () => {
      noQueue();
      claimState = { data: { kind: 'admitted', admission: { admissionToken: 'adm' } } };
      render();
      expect(router.replace).toHaveBeenCalledWith('/order?event=evt_pelita');
    });

    it('sends a guest straight to sign in, back to this queue', () => {
      noQueue();
      claimState = { data: { kind: 'sign-in' } };
      render();
      expect(router.replace).toHaveBeenCalledWith('/login?next=%2Fqueue%3Fevent%3Devt_pelita');
    });

    it('keeps the turn screen for a turn that came while waiting', () => {
      joinState = { data: place() };
      frontierState = { data: frontier({ served: 19700 }) };
      const d = deps();
      const { result } = render(d);
      expect(result.current.status).toBe('turn');
      expect(windowOptions.enabled).toBe(true);
      expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith(
        'queue_join',
        expect.objectContaining({ outcome: 'joined' }),
      );
      expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('queue_turn', {
        event_id: 'evt_pelita',
        wait_bucket: '0-60',
      });
    });
  });

  describe('graceful states (NFR-01)', () => {
    type IntervalState = { data: unknown; dataUpdatedAt: number; errorUpdatedAt: number; errorUpdateCount: number };
    const interval = (state: Partial<IntervalState>) =>
      (frontierOptions.refetchInterval as (q: { state: IntervalState }) => number | false)({
        state: { data: frontierState.data, dataUpdatedAt: 500, errorUpdatedAt: 0, errorUpdateCount: 0, ...state },
      });

    it('backs the poll off while it fails in a row, and goes back to normal after a success', () => {
      joinState = { data: place() };
      frontierState = { data: frontier() };
      render();
      expect(interval({ dataUpdatedAt: 1_000_500 })).toBe(5000); // 1.248 back, success: 5 s
      expect(interval({ errorUpdatedAt: 1_005_500, errorUpdateCount: 1 })).toBe(10_000);
      expect(interval({ errorUpdatedAt: 1_015_500, errorUpdateCount: 2 })).toBe(20_000);
      expect(interval({ errorUpdatedAt: 1_095_500, errorUpdateCount: 5 })).toBe(60_000);
      expect(interval({ dataUpdatedAt: 1_100_500, errorUpdatedAt: 1_095_500, errorUpdateCount: 5 })).toBe(5000);
      expect(interval({ dataUpdatedAt: 1_100_500, errorUpdatedAt: 1_105_500, errorUpdateCount: 6 })).toBe(10_000);
    });

    it('hands the button back once the claim has failed for good', () => {
      joinState = { data: place() };
      frontierState = { data: frontier({ served: 19700 }) };
      claimState = { isError: true, error: { status: 503, code: 'INTERNAL_ERROR', message: 'x' } };
      const { result } = render();
      expect(result.current.status).toBe('turn');
      expect(result.current.turn?.claiming).toBe(false);
      result.current.claimNow();
      expect(refetch).toHaveBeenCalled();
    });
  });

  describe('leaving the queue (FR-04-W2)', () => {
    it('offers the link while holding a place, with the number and the people ahead in the confirm', () => {
      joinState = { data: place() };
      eventsState = { data: EVENTS };
      const { result } = render();
      expect(result.current.leave).toMatchObject({
        open: false,
        leaving: false,
        body: 'queue_leave_body:{"seq":"19.700","ahead":"1.248"}',
      });
      act(() => result.current.leave!.ask());
      expect(result.current.leave!.open).toBe(true);
      act(() => result.current.leave!.stay());
      expect(result.current.leave!.open).toBe(false);
    });

    it('says the place is given up without a number before the draw, and offers no link without a place', () => {
      joinState = {
        data: place({ state: 'preopen', seq: null, served: null, position: null, opensAt: '2026-11-09T03:09:00Z' }),
      };
      expect(render().result.current.leave?.body).toBe('queue_leave_body_no_number');
      joinState = { data: { kind: 'sold-out' } };
      expect(render().result.current.leave).toBeNull();
    });

    it('leaves with the loading overlay, stops following the line, and shows the left view', async () => {
      const d = deps();
      joinState = { data: place() };
      eventsState = { data: EVENTS };
      const { result } = render(d);
      act(() => result.current.leave!.ask());
      act(() => result.current.leave!.confirm());
      expect(leaveMutate).toHaveBeenCalledWith(19700);
      await leaveMutation.mutationFn();
      expect(d.leaveQueueUseCase.execute).toHaveBeenCalledWith('evt_pelita');
      act(() => {
        leaveMutation.onSuccess({ kind: 'left' } as never, 19700 as never);
      });
      expect(result.current.status).toBe('left');
      expect(result.current.leave).toBeNull();
      expect(result.current.left).toEqual({
        lead: 'queue_left_lead:{"seq":"19.700"}',
        body: 'queue_left_body:{"event":"PELITA"}',
      });
      expect(frontierOptions.enabled).toBe(false);
      expect(claimOptions.enabled).toBe(false);
      expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('queue_leave', {
        event_id: 'evt_pelita',
        position_bucket: '1001-10000',
      });
      expect(toggleLoading).toHaveBeenCalledTimes(2);
      expect(result.current.event?.kicker).toBe('queue_kicker_open');

      // "Antre lagi": a new number at the back.
      act(() => result.current.queueAgain());
      expect(result.current.status).toBe('waiting');
      expect(refetch).toHaveBeenCalled();
    });

    it('words the left view without a number or the event', () => {
      joinState = { data: place({ state: 'preopen', seq: null, served: null, position: null }) };
      eventsState = {};
      const { result } = render();
      act(() => {
        leaveMutation.onSuccess({ kind: 'left' } as never, null as never);
      });
      expect(result.current.left).toEqual({
        lead: 'queue_left_lead_no_number',
        body: 'queue_left_body_no_event',
      });
    });

    it('closes the confirm and shows the error when leaving fails; the place is kept', () => {
      joinState = { data: place() };
      leavePending = true;
      const { result } = render();
      expect(result.current.leave!.leaving).toBe(true);
      act(() => result.current.leave!.ask());
      act(() => {
        leaveMutation.onError({ status: 0, code: 'NETWORK_ERROR', message: 'x' } as never);
      });
      expect(openPopupError).toHaveBeenCalledWith({ message: 'error_unknown_error' });
      expect(result.current.leave!.open).toBe(false);
      expect(result.current.status).toBe('waiting');
      act(() => {
        leaveMutation.onError({ status: 429, code: 'RATE_LIMITED', message: 'x' } as never);
      });
      expect(openPopupError).toHaveBeenLastCalledWith({ message: 'error_rate_limited' });
      expect(toggleLoading).toHaveBeenCalledTimes(2);
    });
  });
});
