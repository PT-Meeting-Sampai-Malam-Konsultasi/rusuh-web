// The only file that reads process.env. Next.js inlines NEXT_PUBLIC_* at build time and only for literal
// `process.env.NAME` references, so every variable is read by name below. All values are public: no secrets.

export interface AppConfig {
  appVersion: string;
  queueApiUrl: string;
  coreApiUrl: string;
  apiTimeoutMs: number;
  midtransClientKey: string;
  midtransSnapUrl: string;
  turnstileSiteKey: string;
  defaultLocale: 'id' | 'en';
  /** Serve the API from MSW sample data (local dev, previews, demos before the backend is up). Never in production. */
  apiMock: boolean;
  /** Sentry (NFR-09-W1). The DSN is public by design; empty turns Sentry off (local dev, tests). */
  sentryDsn: string;
  /** `staging`, `production`; `development` when unset. */
  sentryEnvironment: string;
  /** Share of page loads traced (web vitals, spans), 0–1. Low by default: 300,000 phones in a sale. */
  sentryTracesSampleRate: number;
  /** Share of errors that keep a session replay, 0–1 (replay only buffers, and never on the waiting room). */
  sentryReplayOnErrorRate: number;
  /**
   * Send `X-Request-ID` on API calls (NFR-09-W1). Off until every API's CORS allows the header: a browser blocks a
   * call whose preflight does not list it.
   */
  requestIdHeader: boolean;
  /** Product analytics (NFR-09-W2): the consent banner and settings, and later GA4. Off unless set to true. */
  analyticsEnabled: boolean;
  /** GA4 web stream (`G-…`, public). GA4 runs only with this set, `analyticsEnabled` on, and a yes to the cookie. */
  gaMeasurementId: string;
}

export type RawEnv = Record<keyof AppConfig, string | undefined>;

export const readEnv = (): RawEnv => ({
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
  queueApiUrl: process.env.NEXT_PUBLIC_QUEUE_API_URL,
  coreApiUrl: process.env.NEXT_PUBLIC_CORE_API_URL,
  apiTimeoutMs: process.env.NEXT_PUBLIC_API_TIMEOUT_MS,
  midtransClientKey: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY,
  midtransSnapUrl: process.env.NEXT_PUBLIC_MIDTRANS_SNAP_URL,
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  defaultLocale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
  apiMock: process.env.NEXT_PUBLIC_API_MOCK,
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sentryEnvironment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  sentryTracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  sentryReplayOnErrorRate: process.env.NEXT_PUBLIC_SENTRY_REPLAY_ON_ERROR_RATE,
  requestIdHeader: process.env.NEXT_PUBLIC_REQUEST_ID_HEADER,
  analyticsEnabled: process.env.NEXT_PUBLIC_ANALYTICS_ENABLED,
  gaMeasurementId: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
});

export function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

export function optionalEnv(value: string | undefined, fallback: string): string {
  return value ? value : fallback;
}

export function boolEnv(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

/** A sample rate in 0–1; anything else falls back. */
export function rateEnv(value: string | undefined, fallback: number): number {
  const rate = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : fallback;
}

export function createConfig(env: RawEnv = readEnv()): AppConfig {
  const timeout = Number(optionalEnv(env.apiTimeoutMs, '10000'));
  const locale = optionalEnv(env.defaultLocale, 'id');
  return {
    appVersion: requireEnv(env.appVersion, 'NEXT_PUBLIC_APP_VERSION'),
    queueApiUrl: requireEnv(env.queueApiUrl, 'NEXT_PUBLIC_QUEUE_API_URL'),
    coreApiUrl: requireEnv(env.coreApiUrl, 'NEXT_PUBLIC_CORE_API_URL'),
    apiTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 10000,
    midtransClientKey: requireEnv(env.midtransClientKey, 'NEXT_PUBLIC_MIDTRANS_CLIENT_KEY'),
    midtransSnapUrl: requireEnv(env.midtransSnapUrl, 'NEXT_PUBLIC_MIDTRANS_SNAP_URL'),
    turnstileSiteKey: requireEnv(env.turnstileSiteKey, 'NEXT_PUBLIC_TURNSTILE_SITE_KEY'),
    defaultLocale: locale === 'en' ? 'en' : 'id',
    apiMock: boolEnv(env.apiMock),
    sentryDsn: optionalEnv(env.sentryDsn, ''),
    sentryEnvironment: optionalEnv(env.sentryEnvironment, 'development'),
    sentryTracesSampleRate: rateEnv(env.sentryTracesSampleRate, 0.05),
    sentryReplayOnErrorRate: rateEnv(env.sentryReplayOnErrorRate, 0.1),
    requestIdHeader: boolEnv(env.requestIdHeader),
    analyticsEnabled: boolEnv(env.analyticsEnabled),
    gaMeasurementId: optionalEnv(env.gaMeasurementId, ''),
  };
}
