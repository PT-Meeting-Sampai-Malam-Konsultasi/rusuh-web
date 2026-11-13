import { afterEach, describe, expect, it, vi } from 'vitest';

import { randomRequestId } from '@infrastructure/adapters/http.adapter';

import { randomUuid } from '../random-uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUuid', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses crypto.randomUUID when available', () => {
    const spy = vi.spyOn(crypto, 'randomUUID');
    const id = randomUuid();
    expect(id).toMatch(UUID_V4);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('builds a v4 from getRandomValues when randomUUID is missing', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true, writable: true });
    try {
      const ids = new Set(Array.from({ length: 50 }, () => randomUuid()));
      expect(ids.size).toBe(50);
      for (const id of ids) expect(id).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true, writable: true });
    }
  });

  it('sets the version and variant bits even on all-ones random bytes', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true, writable: true });
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).fill(0xff);
      return array;
    });
    try {
      expect(randomUuid()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true, writable: true });
    }
  });

  it('is the adapter request id generator', () => {
    expect(randomRequestId).toBe(randomUuid);
  });
});
