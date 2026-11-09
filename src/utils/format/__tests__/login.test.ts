import { describe, expect, it } from 'vitest';

import { eventIdFromPath, loginReturnOf, safeNextPath, secondsLeft } from '../login';

describe('safeNextPath', () => {
  it.each([
    ['/queue?event=evt_samudra', '/queue?event=evt_samudra'],
    ['/account', '/account'],
    [' /tickets ', '/tickets'],
    [null, '/'],
    ['', '/'],
    ['https://evil.test', '/'],
    ['//evil.test', '/'],
    ['/\\evil.test', '/'],
    ['javascript:alert(1)', '/'],
  ])('%s → %s', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });
});

describe('eventIdFromPath', () => {
  it('reads the event id from the query', () => {
    expect(eventIdFromPath('/queue?event=evt_samudra')).toBe('evt_samudra');
    expect(eventIdFromPath('/order?x=1&event=%20evt_a%20')).toBe('evt_a');
    expect(eventIdFromPath('/account')).toBeNull();
    expect(eventIdFromPath('/queue?event=')).toBeNull();
  });
});

describe('loginReturnOf', () => {
  it('names the screen sign-in returns to', () => {
    expect(loginReturnOf('/queue?event=a')).toBe('queue');
    expect(loginReturnOf('/order?event=a')).toBe('order');
    expect(loginReturnOf('/account#x')).toBe('other');
  });
});

describe('secondsLeft', () => {
  it('counts down from the answer and stops at zero', () => {
    expect(secondsLeft(60, 1_000, 1_000)).toBe(60);
    expect(secondsLeft(60, 1_000, 19_500)).toBe(42);
    expect(secondsLeft(60, 1_000, 99_000)).toBe(0);
    expect(secondsLeft(60, 1_000, 500)).toBe(60);
  });
});
