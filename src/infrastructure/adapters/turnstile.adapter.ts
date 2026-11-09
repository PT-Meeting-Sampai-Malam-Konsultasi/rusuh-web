import type { TurnstileProtocol } from '@core/protocols/turnstile.protocol';

import { HttpRequestError } from './http.adapter';

/** Explicit rendering: the widget appears only where and when getToken() asks for it. */
export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  appearance?: 'always' | 'execute' | 'interaction-only';
  language?: string;
  callback?: (token: string) => void;
  'error-callback'?: (code?: string) => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
}

/** The part of Cloudflare's `window.turnstile` this adapter uses. */
export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined;
  remove(widgetId: string): void;
}

export interface TurnstileAdapterOptions {
  siteKey: string;
  /** Widget language, read per call ("id" or "en"). */
  getLocale: () => string;
  /** Id of the element the page reserves for the widget; the body is used when it is missing. */
  slotId: string;
  /** Gives up after this long (a challenge nobody answers, a blocked script). */
  timeoutMs?: number;
}

type TurnstileWindow = Window & { turnstile?: TurnstileApi };

const unavailable = (message: string, cause?: unknown) =>
  new HttpRequestError({ status: 0, code: 'VERIFICATION_UNAVAILABLE', message }, { cause });

/**
 * Cloudflare Turnstile in Managed mode with `interaction-only`: most people see nothing, a few tick one box.
 * The script loads on the first call only, so pages that never join don't pay for it.
 */
export function createTurnstileAdapter({
  siteKey,
  getLocale,
  slotId,
  timeoutMs = 60_000,
}: TurnstileAdapterOptions): TurnstileProtocol {
  let loading: Promise<TurnstileApi> | null = null;

  const load = (): Promise<TurnstileApi> => {
    const win = window as TurnstileWindow;
    if (win.turnstile) return Promise.resolve(win.turnstile);
    loading ??= new Promise<TurnstileApi>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.onload = () => (win.turnstile ? resolve(win.turnstile) : reject(unavailable('Turnstile did not start')));
      script.onerror = () => {
        loading = null; // let the next call try again
        script.remove();
        reject(unavailable('Turnstile script failed to load'));
      };
      document.head.appendChild(script);
    });
    return loading;
  };

  return {
    getToken: async (action) => {
      const turnstile = await load();
      const host = document.getElementById(slotId) ?? document.body;
      const container = document.createElement('div');
      host.appendChild(container);
      return new Promise<string>((resolve, reject) => {
        let widgetId: string | undefined;
        let done = false;
        const finish = (settle: () => void) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (widgetId) turnstile.remove(widgetId);
          container.remove();
          settle();
        };
        const fail = (message: string) => finish(() => reject(unavailable(message)));
        const timer = setTimeout(() => fail('Turnstile timed out'), timeoutMs);
        try {
          widgetId = turnstile.render(container, {
            sitekey: siteKey,
            action,
            appearance: 'interaction-only',
            language: getLocale(),
            callback: (token) => finish(() => resolve(token)),
            'error-callback': (code) => fail(`Turnstile error ${code ?? ''}`.trim()),
            'expired-callback': () => fail('Turnstile token expired'),
            'timeout-callback': () => fail('Turnstile challenge timed out'),
          });
        } catch (error) {
          finish(() => reject(unavailable('Turnstile failed to render', error)));
        }
      });
    },
  };
}
