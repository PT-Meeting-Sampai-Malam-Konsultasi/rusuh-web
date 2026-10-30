import type { StorageProtocol } from '@core/protocols/storage.protocol';

/** localStorage, safe when it is unavailable (prerender, private mode, quota). */
export function createStorageAdapter(store?: Storage): StorageProtocol {
  const target = (): Storage | null => {
    if (store) return store;
    try {
      return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
      return null;
    }
  };
  return {
    get: (key) => {
      try {
        return target()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        target()?.setItem(key, value);
      } catch {
        // Storage full or blocked: the value simply isn't remembered.
      }
    },
    remove: (key) => {
      try {
        target()?.removeItem(key);
      } catch {
        // Same as above.
      }
    },
  };
}
