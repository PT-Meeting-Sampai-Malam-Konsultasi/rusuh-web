import { describe, expect, it, vi } from 'vitest';

import { CONSENT_MAX_AGE_MS, createConsentStore } from '../consent-store.adapter';

const memory = () => {
  const values = new Map<string, string>();
  return {
    values,
    get: (key: string) => values.get(key) ?? null,
    set: (key: string, value: string) => void values.set(key, value),
    remove: (key: string) => void values.delete(key),
  };
};

describe('createConsentStore', () => {
  it('saves the choice with its time, and reads it back', () => {
    const storage = memory();
    const store = createConsentStore({ storage, now: () => Date.parse('2026-11-13T03:00:00Z') });
    expect(store.get()).toBeNull();
    store.set('granted');
    expect(JSON.parse(storage.values.get('rusuh.consent') ?? '')).toEqual({
      analytics: 'granted',
      at: '2026-11-13T03:00:00.000Z',
    });
    expect(store.get()).toBe('granted');
    store.set('denied');
    expect(store.get()).toBe('denied');
  });

  it('tells subscribers about every choice until they unsubscribe', () => {
    const store = createConsentStore({ storage: memory() });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set('granted');
    unsubscribe();
    store.set('denied');
    expect(listener.mock.calls).toEqual([['granted']]);
  });

  it('asks again after a year', () => {
    const storage = memory();
    let time = Date.parse('2026-11-13T03:00:00Z');
    const store = createConsentStore({ storage, now: () => time });
    store.set('granted');
    time += CONSENT_MAX_AGE_MS;
    expect(store.get()).toBe('granted');
    time += 1;
    expect(store.get()).toBeNull();
  });

  it('treats anything unreadable as not asked', () => {
    const storage = memory();
    const store = createConsentStore({ storage });
    for (const raw of ['nope', '{"analytics":"maybe","at":"2026-11-13T03:00:00Z"}', '{"analytics":"granted"}']) {
      storage.values.set('rusuh.consent', raw);
      expect(store.get()).toBeNull();
    }
  });

  it('uses the real clock by default', () => {
    const storage = memory();
    const store = createConsentStore({ storage });
    store.set('denied');
    expect(store.get()).toBe('denied');
  });
});
