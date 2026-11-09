import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventSummary } from '@core/entities/catalog/catalog.entity';
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

interface QueryState {
  data?: unknown;
  isError?: boolean;
  error?: { status: number; code: string; message: string } | null;
  dataUpdatedAt?: number;
}

describe('QueueController', () => {
  let joinOptions: Record<string, unknown>;
  let eventsOptions: Record<string, unknown>;
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
    getHomeEventsUseCase: { execute: vi.fn().mockResolvedValue('events') },
    analyticsAdapter: { trackPageView: vi.fn(), trackEvent: vi.fn(), reportError: vi.fn() },
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    ERROR_CODE_MAP: { RATE_LIMITED: 'error_rate_limited', UNKNOWN_ERROR: 'error_unknown_error' },
    useTranslation: () => ({ t, i18n }),
    useSearchParamsNext: () => new URLSearchParams(search),
    useQueryTanstack: (options: { queryKey: unknown[] } & Record<string, unknown>) => {
      const isJoin = options.queryKey[0] === 'queue-place';
      if (isJoin) joinOptions = options;
      else eventsOptions = options;
      const state = isJoin ? joinState : eventsState;
      return { data: undefined, isError: false, error: null, refetch, dataUpdatedAt: 0, ...state };
    },
  });

  const render = (d = deps()) => renderHook(() => QueueController(d as never));

  beforeEach(() => {
    vi.clearAllMocks();
    search = 'event=evt_pelita';
    joinState = {};
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
    joinState = { data: place() };
    const { result } = render();
    expect(result.current.status).toBe('waiting');
    expect(result.current.waiting).toEqual({ position: '1.248', progress: 45.7, served: '18.452', seq: '19.700' });
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
    joinState = { data: place({ state: 'paused', position: null }) };
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
});
