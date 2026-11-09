import type { AdmissionStoreProtocol } from '@core/protocols/admission-store.protocol';

export interface AdmissionStoreOptions {
  /** Returned by get() for any event with no stored token. Only wired when config.apiMock is true. */
  fallbackToken?: string;
}

/** Placeholder the mock API accepts; never a real token. */
export const MOCK_ADMISSION_TOKEN = 'mock-admission-token';

/** Keeps admission tokens in memory only (never in storage, cookies or logs); a refresh loses them. */
export function createAdmissionStore(options: AdmissionStoreOptions = {}): AdmissionStoreProtocol {
  const tokens = new Map<string, string>();
  return {
    get: (eventId) => tokens.get(eventId) ?? options.fallbackToken ?? null,
    set: (eventId, token) => {
      if (token === null) tokens.delete(eventId);
      else tokens.set(eventId, token);
    },
  };
}
