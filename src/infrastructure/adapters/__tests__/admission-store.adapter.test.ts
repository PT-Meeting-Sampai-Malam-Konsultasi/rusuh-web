import { describe, expect, it } from 'vitest';

import { createAdmissionStore, MOCK_ADMISSION_TOKEN } from '../admission-store.adapter';

describe('createAdmissionStore', () => {
  it('holds one token per event in memory', () => {
    const store = createAdmissionStore();
    expect(store.get('evt_a')).toBeNull();
    store.set('evt_a', 'adm-a');
    expect(store.get('evt_a')).toBe('adm-a');
    expect(store.get('evt_b')).toBeNull();
    store.set('evt_a', null);
    expect(store.get('evt_a')).toBeNull();
  });

  it('replaces the token of an event', () => {
    const store = createAdmissionStore();
    store.set('evt_a', 'old');
    store.set('evt_a', 'new');
    expect(store.get('evt_a')).toBe('new');
  });

  it('falls back to the mock token for any event without one', () => {
    const store = createAdmissionStore({ fallbackToken: MOCK_ADMISSION_TOKEN });
    expect(store.get('evt_a')).toBe(MOCK_ADMISSION_TOKEN);
    store.set('evt_a', 'adm-a');
    expect(store.get('evt_a')).toBe('adm-a');
    store.set('evt_a', null);
    expect(store.get('evt_a')).toBe(MOCK_ADMISSION_TOKEN);
  });

  it('never shares state between two stores', () => {
    const one = createAdmissionStore();
    const two = createAdmissionStore();
    one.set('evt_a', 'adm-a');
    expect(two.get('evt_a')).toBeNull();
  });
});
