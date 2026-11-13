import { describe, expect, it } from 'vitest';

import { resolveScenario } from '../scenario';

describe('resolveScenario', () => {
  it('prefers the URL, then the saved scenario, then ok', () => {
    expect(resolveScenario('?mock=empty', 'error')).toBe('empty');
    expect(resolveScenario('', 'error')).toBe('error');
    expect(resolveScenario('?mock=ok', 'error')).toBe('ok');
    expect(resolveScenario('', null)).toBe('ok');
  });

  it('ignores unknown names', () => {
    expect(resolveScenario('?mock=chaos', 'nope')).toBe('ok');
  });

  it('knows the admission_invalid and stream_off scenarios', () => {
    expect(resolveScenario('?mock=admission_invalid', null)).toBe('admission_invalid');
    expect(resolveScenario('?mock=stream_off', null)).toBe('stream_off');
    expect(resolveScenario('?mock=near_front', null)).toBe('near_front');
    expect(resolveScenario('?mock=far_back', null)).toBe('far_back');
    expect(resolveScenario('?mock=no_queue', null)).toBe('no_queue');
    expect(resolveScenario('?mock=dukcapil_down', null)).toBe('dukcapil_down');
  });

  it('knows the short_window scenario (FR-17-W1)', () => {
    expect(resolveScenario('?mock=short_window', null)).toBe('short_window');
    expect(resolveScenario('', 'short_window')).toBe('short_window');
    expect(resolveScenario('?mock=ok', 'short_window')).toBe('ok');
  });

  it('knows the hold scenarios (FR-16-W1)', () => {
    expect(resolveScenario('?mock=nik_seat_taken', null)).toBe('nik_seat_taken');
    expect(resolveScenario('?mock=category_sold_out', null)).toBe('category_sold_out');
    expect(resolveScenario('?mock=payment_busy', null)).toBe('payment_busy');
    expect(resolveScenario('', 'payment_busy')).toBe('payment_busy');
  });
});
