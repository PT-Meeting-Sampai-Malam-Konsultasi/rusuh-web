import { describe, expect, it } from 'vitest';

import { mainNav } from '../navigation';

const t = ((key: string) => key) as never;

describe('mainNav', () => {
  it('lists the four sections, marks the open one, and keeps the queue tab phone-only', () => {
    const nav = mainNav(t, 'queue');
    expect(nav.map((item) => [item.icon, item.href, item.label, item.desktop])).toEqual([
      ['events', '/', 'nav_events', true],
      ['queue', '/queue', 'nav_queue', false],
      ['tickets', '/tickets', 'nav_tickets', true],
      ['account', '/account', 'nav_account', true],
    ]);
    expect(nav.filter((item) => item.current).map((item) => item.icon)).toEqual(['queue']);
  });
});
