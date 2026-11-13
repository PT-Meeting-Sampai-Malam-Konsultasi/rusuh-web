import { afterEach, describe, expect, it, vi } from 'vitest';

import { MOCK_SCENARIO_KEY, mockSnapOutcome, readMockScenario, resolveScenario } from '../scenario';

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

  it('knows the short_payment scenario (FR-21-W1)', () => {
    expect(resolveScenario('?mock=short_payment', null)).toBe('short_payment');
    expect(resolveScenario('', 'short_payment')).toBe('short_payment');
    expect(resolveScenario('?mock=ok', 'short_payment')).toBe('ok');
  });

  it('knows the payment scenarios (FR-20-W1)', () => {
    for (const name of ['snap_busy', 'snap_closed', 'payment_denied', 'payment_pending', 'payment_late']) {
      expect(resolveScenario(`?mock=${name}`, null)).toBe(name);
      expect(resolveScenario('', name)).toBe(name);
    }
  });
});

describe('mockSnapOutcome', () => {
  it.each([
    ['snap_closed', 'closed'],
    ['payment_pending', 'pending'],
    ['payment_denied', 'error'],
    ['ok', 'success'],
    ['snap_busy', 'success'],
    ['payment_late', 'success'],
  ] as const)('%s → %s', (scenario, outcome) => {
    expect(mockSnapOutcome(scenario)).toBe(outcome);
  });
});

describe('readMockScenario', () => {
  afterEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('reads the URL first, then sessionStorage, and saves the result', () => {
    window.history.replaceState(null, '', '/payment?booking=bk_1&mock=payment_denied');
    expect(readMockScenario()).toBe('payment_denied');
    expect(sessionStorage.getItem(MOCK_SCENARIO_KEY)).toBe('payment_denied');
    window.history.replaceState(null, '', '/payment?booking=bk_1');
    expect(readMockScenario()).toBe('payment_denied');
    window.history.replaceState(null, '', '/payment?mock=ok');
    expect(readMockScenario()).toBe('ok');
    expect(sessionStorage.getItem(MOCK_SCENARIO_KEY)).toBe('ok');
  });

  it('falls back to the URL when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    window.history.replaceState(null, '', '/?mock=snap_closed');
    expect(readMockScenario()).toBe('snap_closed');
    window.history.replaceState(null, '', '/');
    expect(readMockScenario()).toBe('ok');
  });
});
