import { describe, expect, it, vi } from 'vitest';

import { apiErrorReporter, combineSinks, createAnalyticsAdapter } from '../analytics.adapter';

describe('apiErrorReporter', () => {
  const analytics = { trackPageView: vi.fn(), trackEvent: vi.fn(), reportError: vi.fn(), setUser: vi.fn() };
  const report = apiErrorReporter(() => analytics);

  it('leaves a breadcrumb with the request ID for every failed call, and reports server errors', () => {
    const server = { status: 503, code: 'INTERNAL_ERROR', message: 'x', requestId: 'req-1' };
    report(server);
    expect(analytics.trackEvent).toHaveBeenCalledWith('api_error', {
      status: 503,
      code: 'INTERNAL_ERROR',
      requestId: 'req-1',
    });
    expect(analytics.reportError).toHaveBeenCalledWith(server, { code: 'INTERNAL_ERROR' });
  });

  it('only leaves a breadcrumb for client and network errors', () => {
    vi.clearAllMocks();
    report({ status: 409, code: 'WRONG_CODE', message: 'x' });
    report({ status: 0, code: 'NETWORK_ERROR', message: 'x', requestId: 'req-2' });
    expect(analytics.trackEvent).toHaveBeenNthCalledWith(1, 'api_error', { status: 409, code: 'WRONG_CODE' });
    expect(analytics.trackEvent).toHaveBeenCalledTimes(2);
    expect(analytics.reportError).not.toHaveBeenCalled();
  });
});

describe('createAnalyticsAdapter', () => {
  it('adds the UI language to every event, and passes page views and errors through', () => {
    const sink = { page: vi.fn(), event: vi.fn(), error: vi.fn() };
    let language = 'id';
    const analytics = createAnalyticsAdapter(sink, { getLanguage: () => language });
    analytics.trackEvent('queue_join', { event_id: 'evt_1', items: [{ item_id: 'evt_1' }] });
    expect(sink.event).toHaveBeenCalledWith('queue_join', {
      event_id: 'evt_1',
      items: [{ item_id: 'evt_1' }],
      language: 'id',
    });
    language = 'en';
    analytics.trackEvent('view_item_list');
    expect(sink.event).toHaveBeenLastCalledWith('view_item_list', { language: 'en' });
    analytics.trackPageView('home');
    analytics.reportError('boom', { boundary: 'home' });
    expect(sink.page).toHaveBeenCalledWith('home');
    expect(sink.error).toHaveBeenCalledWith('boom', { boundary: 'home' });
  });

  it('sends events as they are without a language source, and drops everything without a sink', () => {
    const sink = { event: vi.fn() };
    createAnalyticsAdapter(sink).trackEvent('login', { method: 'email_code' });
    expect(sink.event).toHaveBeenCalledWith('login', { method: 'email_code' });
    expect(() => createAnalyticsAdapter().trackEvent('login')).not.toThrow();
  });
});

describe('createAnalyticsAdapter user (tracking plan §1)', () => {
  it('passes the account and keeps signed_in and app_language up to date, sending them only on a change', () => {
    const sink = { page: vi.fn(), event: vi.fn(), user: vi.fn(), userProperties: vi.fn() };
    let language = 'id';
    const analytics = createAnalyticsAdapter(sink, { getLanguage: () => language });
    analytics.trackPageView('home');
    analytics.trackEvent('view_item_list');
    expect(sink.userProperties.mock.calls).toEqual([[{ signed_in: 'false', app_language: 'id' }]]);

    analytics.setUser('usr_1');
    expect(sink.user).toHaveBeenLastCalledWith('usr_1');
    expect(sink.userProperties).toHaveBeenLastCalledWith({ signed_in: 'true', app_language: 'id' });

    language = 'en';
    analytics.trackEvent('login');
    expect(sink.userProperties).toHaveBeenLastCalledWith({ signed_in: 'true', app_language: 'en' });

    analytics.setUser(null);
    expect(sink.user).toHaveBeenLastCalledWith(null);
    expect(sink.userProperties).toHaveBeenLastCalledWith({ signed_in: 'false', app_language: 'en' });
    expect(sink.userProperties).toHaveBeenCalledTimes(4);
  });
});

describe('combineSinks', () => {
  it('passes every call to each sink that handles it', () => {
    const a = { page: vi.fn(), event: vi.fn(), error: vi.fn(), user: vi.fn(), userProperties: vi.fn() };
    const b = { event: vi.fn() };
    const sink = combineSinks(a, b, {});
    sink.page?.('home');
    sink.event?.('queue_join', { event_id: 'evt_1' });
    sink.error?.('boom', { code: 'X' });
    sink.user?.('usr_1');
    sink.userProperties?.({ signed_in: 'true' });
    expect(a.page).toHaveBeenCalledWith('home');
    expect(a.event).toHaveBeenCalledWith('queue_join', { event_id: 'evt_1' });
    expect(b.event).toHaveBeenCalledWith('queue_join', { event_id: 'evt_1' });
    expect(a.error).toHaveBeenCalledWith('boom', { code: 'X' });
    expect(a.user).toHaveBeenCalledWith('usr_1');
    expect(a.userProperties).toHaveBeenCalledWith({ signed_in: 'true' });
  });
});
