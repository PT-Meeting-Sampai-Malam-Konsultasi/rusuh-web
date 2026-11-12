import type { AnalyticsProtocol } from '@core/protocols/analytics.protocol';
import type { HttpError } from '@core/protocols/http.protocol';

export interface AnalyticsSink {
  page?(page: string): void;
  event?(name: string, params?: Record<string, string | number | boolean>): void;
  error?(error: unknown, context?: Record<string, string>): void;
}

/** Analytics with a pluggable sink. Without a provider configured, calls are dropped. */
export function createAnalyticsAdapter(sink: AnalyticsSink = {}): AnalyticsProtocol {
  return {
    trackPageView: (page) => sink.page?.(page),
    trackEvent: (name, params) => sink.event?.(name, params),
    reportError: (error, context) => sink.error?.(error, context),
  };
}

/**
 * For the HTTP adapters' `onError` (NFR-09-W1): every failed call leaves a breadcrumb with its request ID, and server
 * errors (5xx) are reported. Network errors are not: a sale-day outage on 300,000 phones would only burn the quota.
 */
export const apiErrorReporter = (getAnalytics: () => AnalyticsProtocol) => (error: HttpError) => {
  const analytics = getAnalytics();
  analytics.trackEvent('api_error', {
    status: error.status,
    code: error.code,
    ...(error.requestId ? { requestId: error.requestId } : {}),
  });
  if (error.status >= 500) analytics.reportError(error, { code: error.code });
};
