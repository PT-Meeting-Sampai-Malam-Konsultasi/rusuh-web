import type { AnalyticsConsent, ConsentStoreProtocol } from '@core/protocols/consent-store.protocol';
import type { StorageProtocol } from '@core/protocols/storage.protocol';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';

/** A choice is asked again after a year. */
export const CONSENT_MAX_AGE_MS = 365 * 24 * 3_600_000;

interface StoredConsent {
  analytics: AnalyticsConsent;
  /** ISO time of the choice. */
  at: string;
}

const isChoice = (value: unknown): value is AnalyticsConsent => value === 'granted' || value === 'denied';

/** The analytics cookie choice in localStorage, with when it was made; anything unreadable counts as not asked. */
export function createConsentStore({
  storage,
  now = () => Date.now(),
}: {
  storage: StorageProtocol;
  now?: () => number;
}): ConsentStoreProtocol {
  return {
    get: () => {
      const raw = storage.get(STORAGE_KEYS.CONSENT);
      if (!raw) return null;
      try {
        const saved = JSON.parse(raw) as Partial<StoredConsent>;
        const at = Date.parse(saved.at ?? '');
        if (!isChoice(saved.analytics) || Number.isNaN(at) || now() - at > CONSENT_MAX_AGE_MS) return null;
        return saved.analytics;
      } catch {
        return null;
      }
    },
    set: (choice) => {
      const value: StoredConsent = { analytics: choice, at: new Date(now()).toISOString() };
      storage.set(STORAGE_KEYS.CONSENT, JSON.stringify(value));
    },
  };
}
