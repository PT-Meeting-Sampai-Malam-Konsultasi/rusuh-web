import { describe, expect, it, vi } from 'vitest';

import { apiErrorReporter } from '../analytics.adapter';

describe('apiErrorReporter', () => {
  const analytics = { trackPageView: vi.fn(), trackEvent: vi.fn(), reportError: vi.fn() };
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
