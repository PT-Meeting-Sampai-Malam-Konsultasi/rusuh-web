import { describe, expect, it } from 'vitest';

import type { StorageProtocol } from '@core/protocols/storage.protocol';

import { createDeviceTokenStore } from '../device-token-store.adapter';
import { createQueuePlaceStore } from '../queue-place-store.adapter';

function memoryStorage(): StorageProtocol & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (key) => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  };
}

describe('createDeviceTokenStore', () => {
  it('keeps the device token under rusuh.device and clears it', () => {
    const storage = memoryStorage();
    const store = createDeviceTokenStore({ storage });
    expect(store.get()).toBeNull();
    store.set('device-token');
    expect(storage.data.get('rusuh.device')).toBe('device-token');
    expect(store.get()).toBe('device-token');
    store.clear();
    expect(store.get()).toBeNull();
  });
});

describe('createQueuePlaceStore', () => {
  it('keeps one place per event', () => {
    const storage = memoryStorage();
    const store = createQueuePlaceStore({ storage });
    store.set('evt_a', { queueToken: 'qa', seq: 10, joinedServed: 2 });
    store.set('evt_b', { queueToken: 'qb', seq: null, joinedServed: null });
    expect(storage.data.has('rusuh.queue.evt_a')).toBe(true);
    expect(store.get('evt_a')).toEqual({ queueToken: 'qa', seq: 10, joinedServed: 2 });
    expect(store.get('evt_b')).toEqual({ queueToken: 'qb', seq: null, joinedServed: null });
    store.remove('evt_a');
    expect(store.get('evt_a')).toBeNull();
  });

  it('reads anything broken or foreign as no place', () => {
    const storage = memoryStorage();
    const store = createQueuePlaceStore({ storage });
    for (const raw of [
      'not json',
      'null',
      '"text"',
      '{"queueToken":1,"seq":1,"joinedServed":1}',
      '{"queueToken":"q","seq":"1","joinedServed":null}',
    ]) {
      storage.set('rusuh.queue.evt_x', raw);
      expect(store.get('evt_x')).toBeNull();
    }
  });
});
