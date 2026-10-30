'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

import type { NetworkStatusApi } from '@infrastructure/di/registry.types';

const NetworkStatusContext = createContext<NetworkStatusApi>({ isOnline: true });

interface Props {
  children: ReactNode;
  /** Same-origin URL fetched to confirm connectivity; navigator.onLine alone is unreliable. */
  heartbeatUrl?: string;
  heartbeatMs?: number;
}

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function NetworkStatusProvider({ children, heartbeatUrl = '/robots.txt', heartbeatMs = 30000 }: Props) {
  // The browser's own signal; assumed online while prerendering.
  const browserOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    const up = () => setReachable(true);
    const down = () => setReachable(false);
    window.addEventListener('online', up);
    const beat = window.setInterval(() => {
      fetch(heartbeatUrl, { method: 'HEAD', cache: 'no-store' }).then(up, down);
    }, heartbeatMs);
    return () => {
      window.removeEventListener('online', up);
      window.clearInterval(beat);
    };
  }, [heartbeatUrl, heartbeatMs]);

  return (
    <NetworkStatusContext.Provider value={{ isOnline: browserOnline && reachable }}>
      {children}
    </NetworkStatusContext.Provider>
  );
}

export function useNetworkStatus(): NetworkStatusApi {
  return useContext(NetworkStatusContext);
}
