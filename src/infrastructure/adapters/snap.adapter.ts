import type { SnapPayResult, SnapProtocol } from '@core/protocols/snap.protocol';

import { HttpRequestError } from './http.adapter';

/** The part of Midtrans' `window.snap` this adapter uses. */
export interface SnapApi {
  pay(
    snapToken: string,
    options: {
      language?: string;
      onSuccess?: (result: unknown) => void;
      onPending?: (result: unknown) => void;
      onError?: (result: unknown) => void;
      onClose?: () => void;
    },
  ): void;
}

export interface SnapAdapterOptions {
  /** config.midtransSnapUrl (sandbox: https://app.sandbox.midtrans.com/snap/snap.js). */
  scriptUrl: string;
  /** config.midtransClientKey, as `data-client-key` (public key; the server key never reaches the web). */
  clientKey: string;
  /** Snap UI language, read per call ('id' | 'en'). */
  getLocale: () => string;
  /** Default 15_000. */
  timeoutMs?: number;
}

type SnapWindow = Window & { snap?: SnapApi };

const unavailable = (message: string, cause?: unknown) =>
  new HttpRequestError({ status: 0, code: 'SNAP_UNAVAILABLE', message }, { cause });

/** snap.js loads on the first load() / pay() only: no other page, and not this one before it is needed. */
export function createSnapAdapter({
  scriptUrl,
  clientKey,
  getLocale,
  timeoutMs = 15_000,
}: SnapAdapterOptions): SnapProtocol {
  let loading: Promise<SnapApi> | null = null;

  const loadApi = (): Promise<SnapApi> => {
    const win = window as SnapWindow;
    if (win.snap) return Promise.resolve(win.snap);
    loading ??= new Promise<SnapApi>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptUrl;
      script.async = true;
      script.dataset.clientKey = clientKey;
      const fail = (message: string) => {
        clearTimeout(timer);
        loading = null; // let the next call try again
        script.remove();
        reject(unavailable(message));
      };
      const timer = setTimeout(() => fail('snap.js timed out'), timeoutMs);
      script.onload = () => {
        if (!win.snap) return fail('snap.js did not start');
        clearTimeout(timer);
        resolve(win.snap);
      };
      script.onerror = () => fail('snap.js failed to load');
      document.head.appendChild(script);
    });
    return loading;
  };

  return {
    load: async () => {
      await loadApi();
    },
    pay: async (snapToken) => {
      const api = await loadApi();
      return new Promise<SnapPayResult>((resolve, reject) => {
        let done = false;
        // The callback payloads are dropped: Midtrans transaction details the client must not act on or log.
        const settle = (result: SnapPayResult) => {
          if (done) return;
          done = true;
          resolve(result);
        };
        try {
          api.pay(snapToken, {
            language: getLocale(),
            onSuccess: () => settle({ kind: 'success' }),
            onPending: () => settle({ kind: 'pending' }),
            onError: () => settle({ kind: 'error' }),
            onClose: () => settle({ kind: 'closed' }),
          });
        } catch (error) {
          done = true;
          reject(unavailable('snap.pay failed', error));
        }
      });
    },
  };
}

export interface MockSnapOptions {
  /** Picked per call (the mock scenario). */
  outcome: () => SnapPayResult['kind'];
  /** Default 800. */
  delayMs?: number;
}

/** NEXT_PUBLIC_API_MOCK: no Midtrans script, no popup; resolves like a finished Snap. */
export function createMockSnap({ outcome, delayMs = 800 }: MockSnapOptions): SnapProtocol {
  return {
    load: async () => {},
    pay: () =>
      new Promise<SnapPayResult>((resolve) => {
        setTimeout(() => resolve({ kind: outcome() }), delayMs);
      }),
  };
}
