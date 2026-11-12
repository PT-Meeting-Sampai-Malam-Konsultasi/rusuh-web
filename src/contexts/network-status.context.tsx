'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

import type { NetworkStatusApi } from '@infrastructure/di/registry.types';

const NetworkStatusContext = createContext<NetworkStatusApi>({ isOnline: true });

interface Props {
  children: ReactNode;
  /** Same-origin URL fetched to confirm connectivity; navigator.onLine alone is unreliable. */
  heartbeatUrl?: string;
  heartbeatMs?: number;
  /** After a failed beat, how long to wait before the second try that confirms the connection is gone. */
  confirmMs?: number;
}

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** A request that came back with a real answer (2xx–3xx): the connection works. Failed loads report status 0. */
const answered = (entry: PerformanceEntry) => {
  const status = (entry as PerformanceResourceTiming).responseStatus;
  return typeof status === 'number' && status >= 200 && status < 400;
};

/**
 * Online = the browser says so and the site answers. The heartbeat is light (NFR-01): a `HEAD` every `heartbeatMs`,
 * skipped when any other request was answered since the last beat (the waiting room's polls already prove it), paused
 * while the tab is hidden, and a failure is confirmed by a second try before the banner shows.
 */
export function NetworkStatusProvider({
  children,
  heartbeatUrl = '/robots.txt',
  heartbeatMs = 30000,
  confirmMs = 5000,
}: Props) {
  // The browser's own signal; assumed online while prerendering.
  const browserOnline = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    let answeredAt = 0;
    let tickAt = Date.now();
    const up = () => setReachable(true);
    const seen = () => {
      answeredAt = Date.now();
      up();
    };

    // Any answered request is proof enough: no extra beat needed for that interval.
    // The heartbeat's own requests are not "another request": they must not skip the next beat.
    const beatUrl = new URL(heartbeatUrl, window.location.href).href;
    const observer =
      typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('resource')
        ? new PerformanceObserver((list) => {
            if (list.getEntries().some((entry) => entry.name !== beatUrl && answered(entry))) seen();
          })
        : null;
    observer?.observe({ type: 'resource' });

    const probe = () =>
      fetch(heartbeatUrl, { method: 'HEAD', cache: 'no-store' }).then(
        () => true,
        () => false,
      );
    const beat = async () => {
      const since = tickAt;
      tickAt = Date.now();
      if (answeredAt > since) return;
      if (await probe()) return up();
      // One failure can be a blip: try once more before saying the connection is gone.
      await new Promise((resolve) => window.setTimeout(resolve, confirmMs));
      if (stopped) return;
      if (await probe()) up();
      else setReachable(false);
    };
    const start = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => void beat(), heartbeatMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        window.clearInterval(timer);
        return;
      }
      // Back in front: check now, unless a request was answered in the last interval, then keep the rhythm.
      tickAt = Date.now() - heartbeatMs;
      void beat();
      start();
    };

    window.addEventListener('online', up);
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState !== 'hidden') start();
    return () => {
      stopped = true;
      window.removeEventListener('online', up);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
      observer?.disconnect();
    };
  }, [heartbeatUrl, heartbeatMs, confirmMs]);

  return (
    <NetworkStatusContext.Provider value={{ isOnline: browserOnline && reachable }}>
      {children}
    </NetworkStatusContext.Provider>
  );
}

export function useNetworkStatus(): NetworkStatusApi {
  return useContext(NetworkStatusContext);
}
