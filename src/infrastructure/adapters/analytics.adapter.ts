import type { AnalyticsProtocol } from '@core/protocols/analytics.protocol';

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
