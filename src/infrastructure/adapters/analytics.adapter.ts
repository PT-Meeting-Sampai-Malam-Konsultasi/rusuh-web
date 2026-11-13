import type { AnalyticsParams, AnalyticsProtocol } from '@core/protocols/analytics.protocol';
import type { HttpError } from '@core/protocols/http.protocol';

export interface AnalyticsSink {
  page?(page: string): void;
  event?(name: string, params?: AnalyticsParams): void;
  error?(error: unknown, context?: Record<string, string>): void;
  user?(userId: string | null): void;
  /** GA4 user properties; called again only when one changes. */
  userProperties?(properties: Record<string, string>): void;
}

export interface AnalyticsAdapterOptions {
  /** The UI language, added to every event as `language` (tracking plan §1). */
  getLanguage?: () => string;
}

/** Several sinks as one (Sentry breadcrumbs and GA4); each gets every call it handles. */
export function combineSinks(...sinks: AnalyticsSink[]): AnalyticsSink {
  return {
    page: (page) => sinks.forEach((sink) => sink.page?.(page)),
    event: (name, params) => sinks.forEach((sink) => sink.event?.(name, params)),
    error: (error, context) => sinks.forEach((sink) => sink.error?.(error, context)),
    user: (userId) => sinks.forEach((sink) => sink.user?.(userId)),
    userProperties: (properties) => sinks.forEach((sink) => sink.userProperties?.(properties)),
  };
}

/**
 * Analytics with a pluggable sink. Without a provider configured, calls are dropped. Keeps the user properties of
 * tracking plan §1 (`signed_in`, `app_language`) up to date before each page view and event.
 */
export function createAnalyticsAdapter(
  sink: AnalyticsSink = {},
  options: AnalyticsAdapterOptions = {},
): AnalyticsProtocol {
  let signedIn = false;
  let sent = '';
  const syncProperties = () => {
    const language = options.getLanguage?.();
    const properties: Record<string, string> = {
      signed_in: String(signedIn),
      ...(language ? { app_language: language } : {}),
    };
    const key = JSON.stringify(properties);
    if (key === sent) return;
    sent = key;
    sink.userProperties?.(properties);
  };
  return {
    trackPageView: (page) => {
      syncProperties();
      sink.page?.(page);
    },
    trackEvent: (name, params) => {
      syncProperties();
      const language = options.getLanguage?.();
      sink.event?.(name, language ? { ...params, language } : params);
    },
    reportError: (error, context) => sink.error?.(error, context),
    setUser: (userId) => {
      signedIn = userId !== null;
      sink.user?.(userId);
      syncProperties();
    },
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
