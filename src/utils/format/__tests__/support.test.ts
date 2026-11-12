import { describe, expect, it } from 'vitest';

import { supportCode } from '../support';

describe('supportCode', () => {
  it('shortens the request ID to its first 8 characters', () => {
    expect(supportCode('3f2a9c1e-7b4d-4e2a-9c1e-1234567890ab')).toBe('3f2a9c1e');
    expect(supportCode('abc')).toBe('abc');
  });
});
