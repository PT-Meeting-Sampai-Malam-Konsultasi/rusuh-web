import type * as SentryBrowser from '@sentry/browser';

import type { AnalyticsSink } from './analytics.adapter';

type SentrySdk = Pick<
  typeof SentryBrowser,
  | 'init'
  | 'addBreadcrumb'
  | 'addIntegration'
  | 'captureException'
  | 'withScope'
  | 'setTag'
  | 'getReplay'
  | 'browserTracingIntegration'
>;
type SentryReplay = Pick<typeof SentryBrowser, 'replayIntegration'>;
type SentryEvent = SentryBrowser.ErrorEvent;
type Breadcrumb = SentryBrowser.Breadcrumb;

export interface SentrySinkOptions {
  dsn: string;
  environment: string;
  /** The build: the tag or commit SHA CI puts in NEXT_PUBLIC_APP_VERSION; source maps are uploaded under it. */
  release: string;
  tracesSampleRate: number;
  replayOnErrorRate: number;
  /** The SDK, imported on demand so it never weighs on the first load. */
  load?: () => Promise<SentrySdk>;
  /** Session Replay, imported only by a session drawn for it, and only away from the waiting room. */
  loadReplay?: () => Promise<SentryReplay>;
  /** When to load it: after the page is interactive and idle. */
  schedule?: (start: () => void) => void;
  /** 0 ≤ n < 1, for the per-session replay draw (crypto, not Math.random). */
  random?: () => number;
}

/** The page where 300,000 phones wait: never recorded. */
const NO_REPLAY_PAGES = new Set(['queue']);
/** Per session: the same error at most this often, and at most this many events in all (a sale-day outage). */
const MAX_SAME_ERROR = 3;
const MAX_EVENTS = 30;

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/** A NIK is 16 digits; with or without spaces between groups of 4. */
const NIK = /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g;
/** JWT-shaped tokens (device, queue, admission, access) and Sentry-style one-time codes. */
const TOKEN = /\beyJ[\w-]+\.[\w-]+\.[\w-]*|\bsntry\w*_[\w/+=.-]+/g;
const SENSITIVE_KEY = /token|auth|cookie|email|nik|otp|password|secret/i;
/** In a URL `code` is a sign-in code; in data it is an API error code (`NOT_FOUND`), which stays. */
const SENSITIVE_PARAM = /token|auth|email|nik|otp|code|password|secret/i;

/** Masks e-mails, NIKs and tokens in free text. */
export function scrubText(value: string): string {
  return value.replace(TOKEN, '[token]').replace(EMAIL, '[email]').replace(NIK, '[nik]');
}

/** Keeps a URL's path and parameter names; drops the values of sensitive ones (`?code=…`, `?email=…`). */
export function scrubUrl(value: string): string {
  const query = value.indexOf('?');
  if (query === -1) return scrubText(value);
  const params = new URLSearchParams(value.slice(query + 1));
  for (const key of [...params.keys()]) if (SENSITIVE_PARAM.test(key)) params.set(key, '[filtered]');
  return scrubText(`${value.slice(0, query)}?${params.toString()}`);
}

/** Walks any JSON-like value: sensitive keys are filtered, strings scrubbed. */
export function scrubValue(value: unknown, key = ''): unknown {
  if (key && SENSITIVE_KEY.test(key) && value !== undefined && value !== null) return '[filtered]';
  if (typeof value === 'string') return /url|from|to/i.test(key) ? scrubUrl(value) : scrubText(value);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubValue(v, k)]));
  }
  return value;
}

/** NIK, e-mail and tokens never leave the browser (NFR-09-W1); Sentry's server-side scrubber is the second net. */
export function scrubEvent<T extends SentryEvent>(event: T): T {
  const scrubbed = { ...event };
  if (scrubbed.message) scrubbed.message = scrubText(scrubbed.message);
  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map((ex) => (ex.value ? { ...ex, value: scrubText(ex.value) } : ex)),
    };
  }
  if (scrubbed.request) {
    // Headers, cookies and bodies carry tokens and NIKs: none of them leave the browser.
    const request = { ...scrubbed.request };
    delete request.headers;
    delete request.cookies;
    delete request.data;
    if (request.url) request.url = scrubUrl(request.url);
    scrubbed.request = request;
  }
  if (scrubbed.breadcrumbs) scrubbed.breadcrumbs = scrubbed.breadcrumbs.map(scrubBreadcrumb);
  if (scrubbed.extra) scrubbed.extra = scrubValue(scrubbed.extra) as T['extra'];
  if (scrubbed.contexts) scrubbed.contexts = scrubValue(scrubbed.contexts) as T['contexts'];
  delete scrubbed.user;
  return scrubbed;
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  return {
    ...crumb,
    ...(crumb.message ? { message: scrubText(crumb.message) } : {}),
    ...(crumb.data ? { data: scrubValue(crumb.data) as Breadcrumb['data'] } : {}),
  };
}

/** Drops repeats of one error, then everything past the session budget: a sale-day outage must not burn the quota. */
export function createEventBudget(maxSame = MAX_SAME_ERROR, maxEvents = MAX_EVENTS) {
  const seen = new Map<string, number>();
  let total = 0;
  return (event: SentryEvent): boolean => {
    const first = event.exception?.values?.[0];
    const key = first ? `${first.type}:${first.value}` : (event.message ?? '');
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > maxSame || total >= maxEvents) return false;
    total += 1;
    return true;
  };
}

const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

/** After `load`, when the browser is idle: never competes with the first paint or the first queue poll. */
const afterInteractive = (start: () => void) => {
  const idle = () => ('requestIdleCallback' in window ? window.requestIdleCallback(start) : setTimeout(start, 1));
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
};

/**
 * Sentry as the analytics adapter's sink (NFR-09-W1): errors with the request ID, the app's events as breadcrumbs,
 * web vitals from a small share of page loads. Calls made before the SDK has loaded are kept and replayed.
 */
export function createSentrySink({
  dsn,
  environment,
  release,
  tracesSampleRate,
  replayOnErrorRate,
  load = () => import('./sentry-sdk'),
  loadReplay = () => import('./sentry-replay'),
  schedule = afterInteractive,
  random = cryptoRandom,
}: SentrySinkOptions): AnalyticsSink {
  let sdk: SentrySdk | null = null;
  let page = '';
  const pending: ((s: SentrySdk) => void)[] = [];
  const run = (call: (s: SentrySdk) => void) => (sdk ? call(sdk) : pending.push(call));

  let withReplay = false;
  let replayAdded = false;

  /**
   * Replay buffers the last moments before an error. It is added (and downloaded) the first time the session is on a
   * page other than the waiting room; it stops there and resumes elsewhere.
   */
  const followReplay = (s: SentrySdk) => {
    if (!withReplay) return;
    const away = !NO_REPLAY_PAGES.has(page);
    if (!replayAdded) {
      if (!away) return;
      replayAdded = true;
      void loadReplay().then(({ replayIntegration }) =>
        s.addIntegration(replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true })),
      );
      return;
    }
    const replay = s.getReplay();
    if (!replay) return;
    if (!away) void replay.stop();
    else if (!replay.getReplayId()) replay.startBuffering();
  };

  const start = async () => {
    const s = await load();
    withReplay = random() < replayOnErrorRate;
    const allow = createEventBudget();
    s.init({
      dsn,
      environment,
      release,
      // No user info, cookies, headers or bodies; the query strings that remain go through scrubUrl.
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [] },
      tracesSampleRate,
      // No trace headers to the API until its CORS allows `sentry-trace` and `baggage`: an unknown header would make
      // the browser block the call. The X-Request-ID links the two sides meanwhile.
      tracePropagationTargets: [],
      integrations: [s.browserTracingIntegration()],
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: withReplay ? 1 : 0,
      denyUrls: [/challenges\.cloudflare\.com/, /midtrans\.com/],
      ignoreErrors: [
        'ResizeObserver loop completed with undelivered notifications',
        'ResizeObserver loop limit exceeded',
      ],
      beforeSend: (event) => (allow(event) ? scrubEvent(event) : null),
      beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
    });
    sdk = s;
    pending.splice(0).forEach((call) => call(s));
    followReplay(s);
  };
  if (typeof window !== 'undefined') schedule(() => void start());

  return {
    page: (name) => {
      page = name;
      run((s) => {
        s.setTag('page', name);
        s.addBreadcrumb({ category: 'navigation', message: name, level: 'info' });
        followReplay(s);
      });
    },
    event: (name, params) =>
      run((s) => s.addBreadcrumb({ category: 'app', message: name, data: params, level: 'info' })),
    error: (error, context) =>
      run((s) =>
        s.withScope((scope) => {
          const requestId = (error as { requestId?: unknown } | null)?.requestId;
          if (typeof requestId === 'string') scope.setTag('request_id', requestId);
          for (const [key, value] of Object.entries(context ?? {})) scope.setTag(key, value);
          s.captureException(error);
        }),
      ),
  };
}
