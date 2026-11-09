'use client';

import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};

/**
 * True while the tab is in front. The waiting room claims the turn only then: a turn that arrives in a background tab
 * waits for the buyer, who has 60 s to come back (PRD W-5). Prerendering counts as visible.
 */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState !== 'hidden',
    () => true,
  );
}
