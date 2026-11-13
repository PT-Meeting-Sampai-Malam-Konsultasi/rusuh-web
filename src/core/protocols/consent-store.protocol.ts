// Pure contract for the analytics cookie choice (NFR-09-W2), kept per device.

export type AnalyticsConsent = 'granted' | 'denied';

export interface ConsentStoreProtocol {
  /** The saved choice, or null when never asked or when the choice has expired (asked again after a year). */
  get(): AnalyticsConsent | null;
  set(choice: AnalyticsConsent): void;
  /** Called after every `set` (GA4 stops and clears its cookies on a "no"); returns the unsubscribe. */
  subscribe(listener: (choice: AnalyticsConsent) => void): () => void;
}
