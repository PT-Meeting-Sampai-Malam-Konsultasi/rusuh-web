import { describe, expect, it } from 'vitest';

import { holdWaitEstimate, waitEstimate, type WaitEstimate } from '../wait-estimate';

const range = (low: number, high: number): WaitEstimate => ({ kind: 'range', low, high });

describe('waitEstimate', () => {
  it('turns the document example into "± 4–6 menit" (1.560 places at 270–360 a minute)', () => {
    expect(waitEstimate(1560, 270, 360)).toEqual(range(4, 6));
  });

  it('rounds outward in steps of 1, 5 and 10 minutes', () => {
    expect(waitEstimate(1248, 240, 360)).toEqual(range(3, 6));
    expect(waitEstimate(6000, 380, 540)).toEqual(range(10, 20));
    expect(waitEstimate(30_000, 380, 540)).toEqual(range(50, 80));
  });

  it('meets in one number when the range is narrow', () => {
    expect(waitEstimate(1200, 300, 300)).toEqual(range(4, 4));
  });

  it('keeps the low end at least 1 and says "soon" under a minute', () => {
    expect(waitEstimate(300, 240, 360)).toEqual(range(1, 2));
    expect(waitEstimate(240, 240, 360)).toEqual(range(1, 1));
    expect(waitEstimate(200, 240, 360)).toEqual({ kind: 'soon' });
  });

  it('gives no estimate without a speed or a number', () => {
    expect(waitEstimate(1248, 0, 0)).toBeNull();
    expect(waitEstimate(1248, undefined, 360)).toBeNull();
    expect(waitEstimate(null, 240, 360)).toBeNull();
  });
});

describe('holdWaitEstimate', () => {
  it('holds a small rise and shows a real slowdown', () => {
    expect(holdWaitEstimate(range(20, 25), range(20, 30))).toEqual(range(20, 25));
    expect(holdWaitEstimate(range(20, 25), range(25, 35))).toEqual(range(25, 35));
  });

  it('always shows a drop, the first estimate, and no estimate when the speed is gone', () => {
    expect(holdWaitEstimate(range(4, 6), range(3, 5))).toEqual(range(3, 5));
    expect(holdWaitEstimate(null, range(4, 6))).toEqual(range(4, 6));
    expect(holdWaitEstimate(range(4, 6), null)).toBeNull();
  });

  it('treats "soon" as one minute', () => {
    expect(holdWaitEstimate({ kind: 'soon' }, range(1, 1))).toEqual({ kind: 'soon' });
    expect(holdWaitEstimate({ kind: 'soon' }, range(1, 2))).toEqual(range(1, 2));
  });
});
