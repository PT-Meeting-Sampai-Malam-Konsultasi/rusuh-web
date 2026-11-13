import type { AnalyticsParams } from '@core/protocols/analytics.protocol';
import type { ConsentStoreProtocol } from '@core/protocols/consent-store.protocol';

import type { AnalyticsSink } from './analytics.adapter';

export const GTAG_SCRIPT_URL = 'https://www.googletagmanager.com/gtag/js';

/** Diagnostics for Sentry only (NFR-09-W1), not product analytics. */
const NOT_FOR_GA4 = new Set(['api_error']);

type Gtag = (...args: unknown[]) => void;
type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag } & Record<string, unknown>;

export interface Ga4SinkOptions {
  /** The Firebase web stream's measurement ID (`G-…`). */
  measurementId: string;
  /** The analytics cookie choice: GA4 sets cookies, so nothing loads or is sent before a yes (PDP law). */
  consent: Pick<ConsentStoreProtocol, 'get' | 'subscribe'>;
  /** Drops sensitive query values (`?code=`, `?email=`) from the URLs sent; the same scrubber as Sentry's. */
  scrubUrl: (url: string) => string;
}

/** Removes `_ga` and `_ga_<stream>` on this host and every parent domain (GA4 writes them on the widest one). */
function clearGaCookies() {
  const names = document.cookie
    .split(';')
    .map((part) => part.split('=')[0].trim())
    .filter((name) => name === '_ga' || name.startsWith('_ga_'));
  const labels = window.location.hostname.split('.');
  const domains = labels.map((_, i) => labels.slice(i).join('.'));
  for (const name of names) {
    document.cookie = `${name}=; Max-Age=0; path=/`;
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}`;
  }
}

/**
 * GA4 on the web (NFR-09-W2 part 3; tracking plan §7): the same events as Android, through gtag.js. The script loads on
 * the first event after a yes, never before. Page views are sent by the screens (`trackPageView`), not by GA4 itself,
 * and their URLs are scrubbed like Sentry's (`?code=`, `?email=`). A "no" later stops it and clears its cookies.
 */
export function createGa4Sink({ measurementId, consent, scrubUrl }: Ga4SinkOptions): AnalyticsSink {
  // Read on use only: the app is prerendered, where there is no window.
  const win = () => window as unknown as GtagWindow;
  const disableKey = `ga-disable-${measurementId}`;
  let gtag: Gtag | null = null;
  let stopped = false;
  // Kept while GA4 is off, and applied when it starts.
  let userId: string | null = null;
  let properties: Record<string, string> | null = null;
  const applyUser = (g: Gtag) => {
    g('set', { user_id: userId });
    if (properties) g('set', 'user_properties', properties);
  };
  /** The screen in view, so a yes given on it still counts its page view. */
  let lastPage: string | null = null;

  const start = (): Gtag => {
    if (gtag) {
      if (stopped) {
        stopped = false;
        win()[disableKey] = false;
        gtag('consent', 'update', { analytics_storage: 'granted' });
        applyUser(gtag);
      }
      return gtag;
    }
    const dataLayer = (win().dataLayer ??= []);
    // gtag queues `arguments` objects, not arrays: Google's own snippet.
    gtag = function gtagStub() {
      // eslint-disable-next-line prefer-rest-params
      dataLayer.push(arguments);
    };
    win().gtag = gtag;
    gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    gtag('js', new Date());
    applyUser(gtag);
    gtag('config', measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: scrubUrl(window.location.href),
    });
    const script = document.createElement('script');
    script.src = `${GTAG_SCRIPT_URL}?id=${encodeURIComponent(measurementId)}`;
    script.async = true;
    document.head.appendChild(script);
    return gtag;
  };

  const send = (name: string, params: AnalyticsParams) => {
    if (consent.get() !== 'granted') return;
    start()('event', name, params);
  };

  const sendPage = (page: string) =>
    send('page_view', { page_title: page, page_location: scrubUrl(window.location.href) });

  consent.subscribe((choice) => {
    if (choice === 'granted') {
      if (lastPage) sendPage(lastPage);
      return;
    }
    if (!gtag || stopped) return;
    stopped = true;
    gtag('consent', 'update', { analytics_storage: 'denied' });
    win()[disableKey] = true;
    clearGaCookies();
  });

  return {
    page: (page) => {
      lastPage = page;
      sendPage(page);
    },
    event: (name, params) => {
      if (!NOT_FOR_GA4.has(name)) send(name, params ?? {});
    },
    user: (next) => {
      userId = next;
      if (gtag && !stopped) gtag('set', { user_id: next });
    },
    userProperties: (next) => {
      properties = next;
      if (gtag && !stopped) gtag('set', 'user_properties', next);
    },
  };
}
