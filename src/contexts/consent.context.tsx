'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type { ConsentStoreProtocol } from '@core/protocols/consent-store.protocol';
import type { ConsentApi } from '@infrastructure/di/registry.types';

interface ConsentState extends ConsentApi {
  /** False until the saved choice has been read on the client (the HTML is prerendered without it). */
  ready: boolean;
  settingsOpen: boolean;
  closeSettings: () => void;
}

const ConsentContext = createContext<ConsentState | null>(null);

/** The footer link "Pengaturan cookie" points here, so it works on every page without wiring each one. */
export const COOKIE_SETTINGS_HASH = '#cookie-settings';

const isSettingsHash = () => window.location.hash === COOKIE_SETTINGS_HASH;

/**
 * The analytics cookie choice (NFR-09-W2). With `enabled` off (NEXT_PUBLIC_ANALYTICS_ENABLED) nothing is read or
 * asked, and the choice reads as not given. The store is read on the client only: the prerendered HTML has no choice.
 */
export function ConsentProvider({
  enabled,
  store,
  children,
}: {
  enabled: boolean;
  store: ConsentStoreProtocol;
  children: ReactNode;
}) {
  // Re-read the store and the hash after a save, a close, or the footer link (hashchange).
  const [listeners] = useState(() => new Set<() => void>());
  const notify = useCallback(() => listeners.forEach((listener) => listener()), [listeners]);
  const subscribe = useCallback(
    (listener: () => void) => {
      listeners.add(listener);
      window.addEventListener('hashchange', listener);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('hashchange', listener);
      };
    },
    [listeners],
  );
  const ready = useSyncExternalStore(
    subscribe,
    () => enabled,
    () => false,
  );
  const analytics = useSyncExternalStore(
    subscribe,
    () => (enabled ? store.get() : null),
    () => null,
  );
  const fromLink = useSyncExternalStore(
    subscribe,
    () => enabled && isSettingsHash(),
    () => false,
  );
  const [opened, setOpened] = useState(false);
  const settingsOpen = opened || fromLink;

  // Shows the footer's "Pengaturan cookie" link (hidden by CSS unless the feature is on).
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.dataset.consent = '';
    return () => {
      delete root.dataset.consent;
    };
  }, [enabled]);

  const setAnalytics = useCallback(
    (granted: boolean) => {
      store.set(granted ? 'granted' : 'denied');
      notify();
    },
    [store, notify],
  );
  const openSettings = useCallback(() => setOpened(true), []);
  const closeSettings = useCallback(() => {
    setOpened(false);
    if (!isSettingsHash()) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    notify();
  }, [notify]);

  const value = useMemo(
    () => ({ enabled, ready, analytics, setAnalytics, settingsOpen, openSettings, closeSettings }),
    [enabled, ready, analytics, setAnalytics, settingsOpen, openSettings, closeSettings],
  );
  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

function useConsentState(): ConsentState {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent must be used inside ConsentProvider');
  return ctx;
}

/** For controllers (through DI): read and change the choice, or open the settings. */
export function useConsent(): ConsentApi {
  const { enabled, analytics, setAnalytics, openSettings } = useConsentState();
  return { enabled, analytics, setAnalytics, openSettings };
}

/** For the app shell that renders the banner and the settings sheet. */
export function useConsentPrompt() {
  const { enabled, ready, analytics, setAnalytics, settingsOpen, closeSettings, openSettings } = useConsentState();
  return {
    bannerVisible: enabled && ready && analytics === null && !settingsOpen,
    analytics,
    setAnalytics,
    settingsOpen,
    openSettings,
    closeSettings,
  };
}
