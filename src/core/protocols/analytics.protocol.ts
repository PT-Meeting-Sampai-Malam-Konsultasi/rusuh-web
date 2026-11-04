// Pure contract for analytics and error reporting.

export interface AnalyticsProtocol {
  trackPageView(page: string): void;
  trackEvent(name: string, params?: Record<string, string | number | boolean>): void;
  reportError(error: unknown, context?: Record<string, string>): void;
}
