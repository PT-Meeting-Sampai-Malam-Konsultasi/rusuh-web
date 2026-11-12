import { describe, expect, it } from 'vitest';

import { createQrEncoder } from '../qr-encoder.adapter';

describe('createQrEncoder', () => {
  it('encodes a payload into a square matrix with a quiet zone', () => {
    const matrix = createQrEncoder().encode('RSH1.SMD-FB-04827.Q2hlY2tJbi1zaWduZWQ');
    expect(matrix.length).toBeGreaterThanOrEqual(21 + 8);
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true);
    expect(matrix[0].some(Boolean)).toBe(false);
    // Top-left finder pattern starts right after the 4-module border.
    expect(matrix[4][4]).toBe(true);
  });
});
