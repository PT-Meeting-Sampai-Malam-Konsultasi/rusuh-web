import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AnalyticsConsent } from '@core/protocols/consent-store.protocol';

import { createGa4Sink, GTAG_SCRIPT_URL } from '../ga4.adapter';

type Win = Window & { dataLayer?: IArguments[]; gtag?: unknown } & Record<string, unknown>;

const consent = (saved: AnalyticsConsent | null = null) => {
  let value = saved;
  const listeners = new Set<(choice: AnalyticsConsent) => void>();
  return {
    get: () => value,
    set: (choice: AnalyticsConsent) => {
      value = choice;
      listeners.forEach((listener) => listener(choice));
    },
    subscribe: (listener: (choice: AnalyticsConsent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const setup = (saved: AnalyticsConsent | null = null) => {
  const store = consent(saved);
  const sink = createGa4Sink({ measurementId: 'G-TEST', consent: store, scrubUrl: (url) => `scrubbed:${url}` });
  return { store, sink };
};

const calls = () => ((window as unknown as Win).dataLayer ?? []).map((args) => Array.from(args));
const events = () => calls().filter(([command]) => command === 'event');
const script = () => document.head.querySelector<HTMLScriptElement>(`script[src^="${GTAG_SCRIPT_URL}"]`);

describe('createGa4Sink', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/login?email=a@b.id');
  });

  afterEach(() => {
    const win = window as unknown as Win;
    delete win.dataLayer;
    delete win.gtag;
    delete win['ga-disable-G-TEST'];
    document.head.querySelectorAll('script').forEach((s) => s.remove());
    document.cookie.split(';').forEach((c) => (document.cookie = `${c.split('=')[0].trim()}=; Max-Age=0; path=/`));
  });

  it('sends nothing and loads nothing before a yes', () => {
    const { sink } = setup('denied');
    sink.page?.('home');
    sink.event?.('queue_join', { event_id: 'evt_1' });
    expect(script()).toBeNull();
    expect(calls()).toEqual([]);
  });

  it('loads gtag on the first event after a yes, with ads off, no automatic page view and a scrubbed URL', () => {
    const { sink } = setup('granted');
    sink.event?.('queue_join', { event_id: 'evt_1' });
    expect(script()?.src).toBe(`${GTAG_SCRIPT_URL}?id=G-TEST`);
    expect(calls()).toContainEqual([
      'consent',
      'default',
      { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
    ]);
    expect(calls()).toContainEqual([
      'config',
      'G-TEST',
      {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        page_location: 'scrubbed:http://localhost:3000/login?email=a@b.id',
      },
    ]);
    expect(events()).toEqual([['event', 'queue_join', { event_id: 'evt_1' }]]);
    sink.event?.('queue_claim', {});
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });

  it('sends page views with the screen name and the scrubbed URL', () => {
    setup('granted').sink.page?.('login');
    expect(events()).toEqual([
      [
        'event',
        'page_view',
        { page_title: 'login', page_location: 'scrubbed:http://localhost:3000/login?email=a@b.id' },
      ],
    ]);
  });

  it('keeps API errors in Sentry only', () => {
    setup('granted').sink.event?.('api_error', { status: 503 });
    expect(calls()).toEqual([]);
  });

  it('counts the screen a yes was given on', () => {
    const { store, sink } = setup();
    sink.page?.('home');
    expect(calls()).toEqual([]);
    store.set('granted');
    expect(events()).toEqual([['event', 'page_view', expect.objectContaining({ page_title: 'home' })]]);
  });

  it('keeps the user and properties until GA4 starts, then sets them before the first hit', () => {
    const { sink } = setup('granted');
    sink.user?.('usr_1');
    sink.userProperties?.({ signed_in: 'true', app_language: 'id' });
    expect(calls()).toEqual([]);
    sink.page?.('home');
    const all = calls();
    const firstEvent = all.findIndex(([command]) => command === 'event');
    expect(all.findIndex((c) => c[0] === 'set' && (c[1] as { user_id?: string }).user_id === 'usr_1')).toBeLessThan(
      firstEvent,
    );
    expect(all.slice(0, firstEvent)).toContainEqual([
      'set',
      'user_properties',
      { signed_in: 'true', app_language: 'id' },
    ]);
    sink.user?.(null);
    expect(calls().at(-1)).toEqual(['set', { user_id: null }]);
  });

  it('sends nothing about the user before a yes', () => {
    const { sink } = setup('denied');
    sink.user?.('usr_1');
    sink.userProperties?.({ signed_in: 'true' });
    expect(calls()).toEqual([]);
  });

  it('stops and clears its cookies on a later no, and starts again on a yes', () => {
    const { store, sink } = setup('granted');
    sink.page?.('home');
    document.cookie = '_ga=GA1.1.1; path=/';
    document.cookie = '_ga_TEST=GS1.1.1; path=/';
    document.cookie = 'other=1; path=/';
    store.set('denied');
    expect(calls()).toContainEqual(['consent', 'update', { analytics_storage: 'denied' }]);
    expect((window as unknown as Win)['ga-disable-G-TEST']).toBe(true);
    expect(document.cookie).toBe('other=1');
    sink.event?.('queue_join', {});
    expect(events()).toHaveLength(1);

    store.set('granted');
    expect((window as unknown as Win)['ga-disable-G-TEST']).toBe(false);
    expect(calls()).toContainEqual(['consent', 'update', { analytics_storage: 'granted' }]);
    expect(events().at(-1)).toEqual(['event', 'page_view', expect.objectContaining({ page_title: 'home' })]);
  });
});
