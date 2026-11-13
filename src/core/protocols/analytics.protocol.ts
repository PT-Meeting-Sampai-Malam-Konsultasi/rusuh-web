// Pure contract for analytics and error reporting.

/** One GA4 item (an event in a list, or a ticket category in an order). */
export type AnalyticsItem = Record<string, string | number>;

/** Event parameters: scalars, plus GA4's `items` list. Never personal data (tracking plan §1). */
export type AnalyticsParams = Record<string, string | number | boolean | AnalyticsItem[]>;

export interface AnalyticsProtocol {
  trackPageView(page: string): void;
  trackEvent(name: string, params?: AnalyticsParams): void;
  reportError(error: unknown, context?: Record<string, string>): void;
  /** The signed-in account (`usr_…`, never the e-mail), or null after sign-out (tracking plan §1). */
  setUser(userId: string | null): void;
}
