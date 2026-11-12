import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TicketsControllerInterface } from '@controllers/tickets.controller';
import type { MyOrderCardView } from '@utils/format/tickets';

import TicketsScreen from '../index';

let controller: TicketsControllerInterface;

vi.mock('@infrastructure/di/container', () => ({ default: { resolve: () => controller } }));
vi.mock('@infrastructure/di/controllers/tickets', () => ({}));

const card = (bookingId: string, past = false): MyOrderCardView => ({
  bookingId,
  href: `/tickets/detail?booking=${bookingId}`,
  past,
  title: `Event ${bookingId}`,
  posterTitle: 'Samudra',
  posterTone: 'blue',
  dateLine: 'Sab, 12 Des 2026 · 19.00 WIB',
  day: '12',
  month: 'Des',
  daysLeft: past ? '' : '30 hari lagi',
  stubs: [{ id: 't1', category: 'Festival B', holder: 'Nadia Saputri' }],
  ticketCount: '1 tiket',
  orderCode: 'RSH-26-084731',
  total: 'Rp 2.180.000',
});

const base = (): TicketsControllerInterface => ({
  t: ((key: string) => key) as never,
  status: 'ready',
  groups: [
    { id: 'upcoming', title: 'Akan datang', summary: '1 pesanan · 1 tiket', orders: [card('bk_1')] },
    { id: 'past', title: 'Sudah lewat', summary: '1 pesanan', orders: [card('bk_2', true)] },
  ],
  errorMessage: '',
  retry: vi.fn(),
  signInHref: '/login?next=%2Ftickets',
  homeHref: '/',
  locale: 'id',
  setLocale: vi.fn(),
  nav: [{ href: '/tickets', label: 'nav_tickets', icon: 'tickets', current: true, desktop: true }],
});

describe('TicketsScreen', () => {
  beforeEach(() => {
    controller = base();
  });

  it('lists upcoming and past orders under their headings', () => {
    render(<TicketsScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('tickets_title');
    expect(screen.getByText('tickets_lead')).toBeInTheDocument();
    const upcoming = screen.getByRole('region', { name: 'Akan datang' });
    expect(upcoming).toHaveTextContent('1 pesanan · 1 tiket');
    expect(upcoming).toHaveTextContent('Event bk_1');
    expect(screen.getByRole('region', { name: 'Sudah lewat' })).toHaveTextContent('Event bk_2');
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  });

  it('shows the loading, empty and signed-out states', () => {
    controller = { ...base(), status: 'loading', groups: [] };
    const { unmount } = render(<TicketsScreen />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('tickets_lead')).not.toBeInTheDocument();
    unmount();

    controller = { ...base(), status: 'empty', groups: [] };
    const empty = render(<TicketsScreen />);
    expect(screen.getByRole('heading', { name: 'tickets_empty_title' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tickets_empty_action/ })).toHaveAttribute('href', '/');
    empty.unmount();

    controller = { ...base(), status: 'signed-out', groups: [] };
    render(<TicketsScreen />);
    expect(screen.getByRole('heading', { name: 'tickets_signed_out_title' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tickets_signed_out_action/ })).toHaveAttribute(
      'href',
      '/login?next=%2Ftickets',
    );
  });

  it('shows an error with a retry', async () => {
    controller = { ...base(), status: 'error', groups: [], errorMessage: 'Layanan gangguan' };
    render(<TicketsScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('Layanan gangguan');
    await userEvent.click(screen.getByRole('button', { name: 'action_retry' }));
    expect(controller.retry).toHaveBeenCalled();
  });
});
