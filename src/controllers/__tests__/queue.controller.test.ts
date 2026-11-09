import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { Frontier } from '@core/entities/queue/queue.entity';
import type { FollowQueueHandlers } from '@core/use_case/queue/follow-queue.use-case';
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
    streamFrom: 0,
    ts: 1,
    ...patch,
  },
});

interface QueryState {
  data?: unknown;
  isError?: boolean;
  error?: { status: number; code: string; message: string } | null;
  dataUpdatedAt?: number;
}

describe('QueueController', () => {
  let joinOptions: Record<string, unknown>;
  let eventsOptions: Record<string, unknown>;
  let frontierOptions: Record<string, unknown>;
  let frontierState: QueryState;
  let streamHandlers: FollowQueueHandlers | undefined;
  const closeStream = vi.fn();
  const setQueryData = vi.fn();
  const queryClient = { setQueryData };
  let joinState: QueryState;
  let eventsState: QueryState;
  let search: string;
  const refetch = vi.fn();
  const changeLanguage = vi.fn();
  const i18n = { language: 'id', changeLanguage };
  const t = vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  );
  const deps = () => ({
    joinQueueUseCase: { execute: vi.fn().mockResolvedValue('joined') },
    followQueueUseCase: {
      poll: vi.fn().mockResolvedValue('frontier'),
      stream: vi.fn((_eventId: string, handlers: FollowQueueHandlers) => {
        streamHandlers = handlers;
        return closeStream;
      }),
    },
    useQueryClientTanstack: () => queryClient,
    getHomeEventsUseCase: { execute: vi.fn().mockResolvedValue('events') },
    analyticsAdapter: { trackPageView: vi.fn(), trackEvent: vi.fn(), reportError: vi.fn() },
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    ERROR_CODE_MAP: { RATE_LIMITED: 'error_rate_limited', UNKNOWN_ERROR: 'error_unknown_error' },
    useTranslation: () => ({ t, i18n }),
    useSearchParamsNext: () => new URLSearchParams(search),
    useQueryTanstack: (options: { queryKey: unknown[] } & Record<string, unknown>) => {
      const key = options.queryKey[0];
      if (key === 'queue-frontier') frontierOptions = options;
      else if (key === 'queue-place') joinOptions = options;
      else eventsOptions = options;
      const state = key === 'queue-frontier' ? frontierState : key === 'queue-place' ? joinState : eventsState;
      return { data: undefined, isError: false, error: null, refetch, dataUpdatedAt: 0, ...state };
    },
  });

  const render = (d = deps()) => renderHook(() => QueueController(d as never));

  beforeEach(() => {
    vi.clearAllMocks();
    search = 'event=evt_pelita';
    joinState = {};
    frontierState = {};
    streamHandlers = undefined;
    eventsState = { data: EVENTS };
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
    expect(d.joinQueueUseCase.execute).toHaveBeenCalledWith('evt_pelita');
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
      eventId: 'evt_pelita',
      outcome: 'joined',
      state: 'open',
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
    const interval = (dataUpdatedAt = 500) =>
      (frontierOptions.refetchInterval as (q: { state: { data: unknown; dataUpdatedAt: number } }) => number | false)({
        state: { data: frontierState.data, dataUpdatedAt },
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

    it('stops at the turn: last place, full track, no more polls (the claim is FR-08)', () => {
      joinState = { data: place() };
      frontierState = { data: frontier({ served: 19700, streamFrom: 2000 }) };
      const d = deps();
      const { result } = render(d);
      expect(result.current.waiting).toMatchObject({ position: '1', progress: 100 });
      expect(interval()).toBe(false);
      expect(d.followQueueUseCase.stream).not.toHaveBeenCalled();
    });

    it('streams near the front instead of polling, and closes the stream on unmount', () => {
      const d = deps();
      joinState = { data: place() };
      frontierState = { data: frontier({ streamFrom: 2000 }) };
      const { unmount } = render(d);
      expect(d.followQueueUseCase.stream).toHaveBeenCalledWith('evt_pelita', expect.any(Object));
      expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('queue_stream', {
        eventId: 'evt_pelita',
        outcome: 'open',
      });

      const next = frontier({ served: 18500, streamFrom: 2000 }).frontier;
      act(() => streamHandlers?.onFrontier(next));
      expect(setQueryData).toHaveBeenCalledWith(['queue-frontier', 'evt_pelita'], { kind: 'frontier', frontier: next });
      expect(frontierOptions.enabled).toBe(false);
      act(() => streamHandlers?.onTurn({ event: 'evt_pelita', seq: 1, served: 1, turnExpiresAt: 'a', serverNow: 'b' }));

      unmount();
      expect(closeStream).toHaveBeenCalled();
    });

    it('does not stream further back than streamFrom, or when streaming is off', () => {
      const d = deps();
      joinState = { data: place() };
      frontierState = { data: frontier({ streamFrom: 1000 }) };
      render(d);
      frontierState = { data: frontier({ streamFrom: 0 }) };
      render(d);
      expect(d.followQueueUseCase.stream).not.toHaveBeenCalled();
    });

    it('falls back to polling and tries the stream again later', () => {
      vi.useFakeTimers({ now: 1_000_000 });
      const d = deps();
      joinState = { data: place() };
      frontierState = { data: frontier({ streamFrom: 2000 }) };
      render(d);
      act(() => streamHandlers?.onFrontier(frontier({ streamFrom: 2000 }).frontier));
      expect(frontierOptions.enabled).toBe(false);

      act(() => streamHandlers?.onFallback('silent'));
      expect(frontierOptions.enabled).toBe(true);
      expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('queue_stream', {
        eventId: 'evt_pelita',
        outcome: 'silent',
      });
      expect(d.followQueueUseCase.stream).toHaveBeenCalledTimes(1);
      act(() => vi.advanceTimersByTime(59_000));
      expect(d.followQueueUseCase.stream).toHaveBeenCalledTimes(1);
      act(() => vi.advanceTimersByTime(2000));
      expect(d.followQueueUseCase.stream).toHaveBeenCalledTimes(2);
    });

    it('retries a first failed connect and a closed stream after 3 s', () => {
      vi.useFakeTimers({ now: 1_000_000 });
      const d = deps();
      joinState = { data: place() };
      frontierState = { data: frontier({ streamFrom: 2000 }) };
      render(d);
      act(() => streamHandlers?.onFallback('connect_failed'));
      act(() => vi.advanceTimersByTime(4000));
      expect(d.followQueueUseCase.stream).toHaveBeenCalledTimes(2);
      act(() => streamHandlers?.onClose());
      act(() => vi.advanceTimersByTime(4000));
      expect(d.followQueueUseCase.stream).toHaveBeenCalledTimes(3);
    });

    it('keeps polling when there is nothing to stream with', () => {
      const d = deps();
      d.followQueueUseCase.stream.mockReturnValueOnce(null as never);
      joinState = { data: place() };
      frontierState = { data: frontier({ streamFrom: 2000 }) };
      render(d);
      expect(frontierOptions.enabled).toBe(true);
    });
  });
});
