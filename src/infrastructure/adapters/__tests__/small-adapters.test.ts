import { describe, expect, it, vi } from 'vitest';

import { createAnalyticsAdapter } from '../analytics.adapter';
import { createTokenStore } from '../token-store.adapter';

describe('createTokenStore', () => {
  it('holds the access token in memory', () => {
    const store = createTokenStore();
    expect(store.getAccessToken()).toBeNull();
    store.setAccessToken('abc');
    expect(store.getAccessToken()).toBe('abc');
    store.setAccessToken(null);
    expect(store.getAccessToken()).toBeNull();
  });
});

describe('createAnalyticsAdapter', () => {
  it('forwards to the sink', () => {
    const sink = { page: vi.fn(), event: vi.fn(), error: vi.fn() };
    const analytics = createAnalyticsAdapter(sink);
    analytics.trackPageView('home');
    analytics.trackEvent('join_queue', { event: 'evt_1' });
    analytics.reportError('boom', { where: 'test' });
    expect(sink.page).toHaveBeenCalledWith('home');
    expect(sink.event).toHaveBeenCalledWith('join_queue', { event: 'evt_1' });
    expect(sink.error).toHaveBeenCalledWith('boom', { where: 'test' });
  });

  it('drops calls without a sink', () => {
    const analytics = createAnalyticsAdapter();
    expect(() => {
      analytics.trackPageView('home');
      analytics.trackEvent('x');
      analytics.reportError(new Error('x'));
    }).not.toThrow();
  });
});
