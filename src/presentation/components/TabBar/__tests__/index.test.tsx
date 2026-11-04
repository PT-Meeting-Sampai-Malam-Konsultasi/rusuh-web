import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import TabBar from '../index';

describe('TabBar', () => {
  it('shows every tab and marks the current one', () => {
    render(
      <TabBar
        label="Menu aplikasi"
        nav={[
          { href: '/', label: 'Event', icon: 'events', current: true, desktop: true },
          { href: '/queue', label: 'Antrian', icon: 'queue', current: false, desktop: false },
          { href: '/tickets', label: 'Tiket', icon: 'tickets', current: false, desktop: true },
          { href: '/account', label: 'Akun', icon: 'account', current: false, desktop: true },
        ]}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'Menu aplikasi' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Event' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Antrian' })).toHaveAttribute('href', '/queue');
  });
});
