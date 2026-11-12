import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HomeEvents } from '@core/use_case/catalog/get-home-events.use-case';

import HomeController from '../home.controller';

const NOW = '2026-11-03T03:00:00Z';
const live = { eventId: 'evt_live', name: 'Samudra', venue: 'GBK', startsAt: '2026-12-12T12:00:00Z', state: 'on_sale' };
const sold = {
  eventId: 'evt_sold',
  name: 'Deru',
  venue: 'Jatim Expo',
  startsAt: '2026-12-04T13:00:00Z',
  state: 'sold_out',
};

interface QueryState {
  data?: HomeEvents;
  isError?: boolean;
  error?: { status: number; code: string; message: string } | null;
}

describe('HomeController', () => {
  let queryOptions: Record<string, unknown>;
  let queryState: QueryState;
  const refetch = vi.fn();
  const changeLanguage = vi.fn();
  const i18n = { language: 'id', changeLanguage };
  const t = vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  );
  const deps = () => ({
    getHomeEventsUseCase: { execute: vi.fn().mockResolvedValue('result') },
    analyticsAdapter: { trackPageView: vi.fn(), trackEvent: vi.fn(), reportError: vi.fn() },
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    ERROR_CODE_MAP: { NETWORK_ERROR: 'error_network_error', UNKNOWN_ERROR: 'error_unknown_error' },
    useTranslation: () => ({ t, i18n }),
    useQueryTanstack: (options: Record<string, unknown>) => {
      queryOptions = options;
      return { data: undefined, isError: false, error: null, refetch, ...queryState };
    },
  });

  const render = (d = deps()) => renderHook(() => HomeController(d as never));

  beforeEach(() => {
    vi.clearAllMocks();
    queryState = {};
    i18n.language = 'id';
  });

  it('loads the events through the use case with a 5 s stale time and 30 s refresh', async () => {
    const d = deps();
    const { result } = render(d);
    expect(result.current.status).toBe('loading');
    expect(queryOptions).toMatchObject({ queryKey: ['events'], staleTime: 5000, refetchInterval: 30000 });
    await expect((queryOptions.queryFn as () => Promise<unknown>)()).resolves.toBe('result');
    expect(d.getHomeEventsUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it('tracks the page view once', () => {
    const d = deps();
    const { rerender } = render(d);
    rerender();
    expect(d.analyticsAdapter.trackPageView).toHaveBeenCalledTimes(1);
    expect(d.analyticsAdapter.trackPageView).toHaveBeenCalledWith('home');
  });

  it('returns formatted cards for the featured event and the rest', () => {
    queryState = { data: { featured: live, others: [sold], total: 2, serverNow: NOW } as HomeEvents };
    const { result } = render();
    expect(result.current.status).toBe('ready');
    expect(result.current.featured?.id).toBe('evt_live');
    expect(result.current.featured?.stamp.label).toBe('event_state_queue_open');
    expect(result.current.events.map((e) => e.id)).toEqual(['evt_sold']);
    expect(result.current.countLabel).toBe('home_count:{"count":2}');
    expect(result.current.errorMessage).toBe('');
  });

  it('reports an empty list', () => {
    queryState = { data: { featured: null, others: [], total: 0, serverNow: NOW } };
    const { result } = render();
    expect(result.current.status).toBe('empty');
    expect(result.current.featured).toBeNull();
  });

  it('translates the error code and retries', () => {
    queryState = { isError: true, error: { status: 0, code: 'NETWORK_ERROR', message: 'offline' } };
    const { result } = render();
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('error_network_error');
    result.current.retry();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the generic message for an unknown code', () => {
    queryState = { isError: true, error: { status: 418, code: 'HTTP_418', message: 'teapot' } };
    expect(render().result.current.errorMessage).toBe('error_unknown_error');
  });

  it('keeps showing the last list when a refresh fails', () => {
    queryState = {
      data: { featured: live, others: [], total: 1, serverNow: NOW } as HomeEvents,
      isError: true,
      error: { status: 0, code: 'NETWORK_ERROR', message: 'offline' },
    };
    expect(render().result.current.status).toBe('ready');
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

  it('tracks the list once and which event was opened (tracking plan view_item_list, select_item)', () => {
    queryState = { data: { featured: live, others: [sold], total: 2, serverNow: NOW } as HomeEvents };
    const d = deps();
    const { result, rerender } = render(d);
    expect(result.current.featured?.join?.href).toBe('/queue?event=evt_live');
    expect(result.current.events[0].join).toBeNull();
    expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('view_item_list', {
      item_list_name: 'home',
      items: [
        expect.objectContaining({ item_id: 'evt_live', item_name: live.name, index: 0 }),
        expect.objectContaining({ item_id: sold.eventId, index: 1 }),
      ],
    });
    rerender();
    expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledTimes(1);

    result.current.selectEvent('evt_live', 0);
    expect(d.analyticsAdapter.trackEvent).toHaveBeenLastCalledWith('select_item', {
      item_list_name: 'home',
      event_id: 'evt_live',
      items: [expect.objectContaining({ item_id: 'evt_live', index: 0 })],
    });
    // An event no longer in the list is not tracked.
    result.current.selectEvent('evt_gone', 3);
    expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledTimes(2);
    expect(result.current.joinHint).toBe('home_join_hint');
  });

  it('builds the navigation with Home as the current page', () => {
    const { nav } = render().result.current;
    expect(nav.map((n) => [n.href, n.current, n.desktop])).toEqual([
      ['/', true, true],
      ['/queue', false, false],
      ['/tickets', false, true],
      ['/account', false, true],
    ]);
    expect(nav[0].label).toBe('nav_events');
  });
});
