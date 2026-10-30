import { describe, expect, it } from 'vitest';

import { createStorageAdapter } from '../storage.adapter';

describe('createStorageAdapter', () => {
  it('reads, writes and removes values', () => {
    const storage = createStorageAdapter(window.localStorage);
    storage.set('k', 'v');
    expect(storage.get('k')).toBe('v');
    storage.remove('k');
    expect(storage.get('k')).toBeNull();
  });

  it('uses window.localStorage by default', () => {
    const storage = createStorageAdapter();
    storage.set('d', '1');
    expect(window.localStorage.getItem('d')).toBe('1');
    storage.remove('d');
  });

  it('never throws when storage is broken', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const storage = createStorageAdapter(broken);
    expect(storage.get('k')).toBeNull();
    expect(() => storage.set('k', 'v')).not.toThrow();
    expect(() => storage.remove('k')).not.toThrow();
  });
});
