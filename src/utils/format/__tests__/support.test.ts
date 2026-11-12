import { describe, expect, it } from 'vitest';

import { supportCode } from '../support';

describe('supportCode', () => {
  it('shortens the request ID, and gives nothing without one', () => {
    expect(supportCode({ requestId: '3f2a9c1e-7b4d-4e2a-9c1e-1234567890ab' })).toBe('3f2a9c1e');
    expect(supportCode({})).toBeUndefined();
    expect(supportCode({ requestId: '' })).toBeUndefined();
  });
});
