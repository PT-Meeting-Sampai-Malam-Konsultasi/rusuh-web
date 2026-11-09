import { describe, expect, it } from 'vitest';

import { retryTransientOnce } from '../retry';

const error = (status: number) => ({ status, code: `HTTP_${status}`, message: 'x' });

describe('retryTransientOnce', () => {
  it.each([0, 500, 502, 503, 504])('retries status %i once', (status) => {
    expect(retryTransientOnce(0, error(status))).toBe(true);
    expect(retryTransientOnce(1, error(status))).toBe(false);
    expect(retryTransientOnce(2, error(status))).toBe(false);
  });

  it.each([400, 401, 403, 404, 409, 429, 499])('never retries status %i', (status) => {
    expect(retryTransientOnce(0, error(status))).toBe(false);
  });
});
