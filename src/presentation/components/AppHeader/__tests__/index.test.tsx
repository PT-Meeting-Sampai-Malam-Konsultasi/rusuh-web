import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AppHeader, { type NavLink } from '../index';

const nav: NavLink[] = [
  { href: '/', label: 'Event', icon: 'events', current: true, desktop: true },
  { href: '/queue', label: 'Antrian', icon: 'queue', current: false, desktop: false },
  { href: '/tickets', label: 'Tiket Saya', icon: 'tickets', current: false, desktop: true },
  { href: '/account', label: 'Akun', icon: 'account', current: false, desktop: true },
];

describe('AppHeader', () => {
  it('links home and shows the desktop links with the current page marked', () => {
    render(
      <AppHeader
        nav={nav}
        locale="id"
        onLocaleChange={vi.fn()}
        labels={{ home: 'Rusuh, ke beranda', nav: 'Utama', language: 'Bahasa' }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Rusuh, ke beranda' })).toHaveAttribute('href', '/');
    const main = screen.getByRole('navigation', { name: 'Utama' });
    expect(
      within(main)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Event', 'Tiket Saya', 'Akun']);
    expect(within(main).getByRole('link', { name: 'Event' })).toHaveAttribute('aria-current', 'page');
    expect(within(main).getByRole('group', { name: 'Bahasa' })).toBeInTheDocument();
  });
});
