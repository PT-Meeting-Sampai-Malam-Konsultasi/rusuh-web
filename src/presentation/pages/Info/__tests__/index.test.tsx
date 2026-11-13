import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { InfoControllerInterface } from '@controllers/info.controller';

import InfoScreen from '../index';

const controller: InfoControllerInterface = {
  t: ((key: string) => key) as never,
  topic: 'refund',
  title: 'Refund',
  lead: 'Kapan uang Anda kembali.',
  updated: 'Diperbarui 13 November 2026',
  sections: [
    { id: 'refund-1', title: 'Pembayaran yang terlambat', paragraphs: ['Tiket tidak terbit.', 'Kami kirim email.'] },
    { id: 'refund-2', title: 'Berapa lama', paragraphs: ['14 hari kerja.'] },
  ],
  links: [
    { href: '/terms', label: 'Syarat & Ketentuan', current: false },
    { href: '/refund', label: 'Refund', current: true },
  ],
  contactEmail: 'bantuan@rusuh-tiket.web.id',
  locale: 'id',
  setLocale: vi.fn(),
  nav: [{ href: '/', label: 'Event', icon: 'events', current: false, desktop: true }],
};

vi.mock('@infrastructure/di/container', () => ({ default: { resolve: () => controller } }));
vi.mock('@infrastructure/di/controllers/info', () => ({}));

describe('InfoScreen', () => {
  it('shows the title, lead, date and every section with its paragraphs', () => {
    render(<InfoScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Refund');
    expect(screen.getByText('Kapan uang Anda kembali.')).toBeInTheDocument();
    expect(screen.getByText('Diperbarui 13 November 2026')).toBeInTheDocument();
    const late = screen.getByRole('region', { name: 'Pembayaran yang terlambat' });
    expect(within(late).getByText('Tiket tidak terbit.')).toBeInTheDocument();
    expect(within(late).getByText('Kami kirim email.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Berapa lama' })).toHaveTextContent('14 hari kerja.');
  });

  it('lists the other pages and marks the open one', () => {
    render(<InfoScreen />);
    const nav = screen.getByRole('navigation', { name: 'info_nav_label' });
    expect(within(nav).getByRole('link', { name: 'Syarat & Ketentuan' })).toHaveAttribute('href', '/terms');
    expect(within(nav).getByRole('link', { name: 'Refund' })).toHaveAttribute('aria-current', 'page');
  });

  it('offers the help address as an email link, with the footer and tab bar', () => {
    render(<InfoScreen />);
    expect(screen.getByRole('link', { name: 'bantuan@rusuh-tiket.web.id' })).toHaveAttribute(
      'href',
      'mailto:bantuan@rusuh-tiket.web.id',
    );
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'nav_app_label' })).toBeInTheDocument();
  });
});
