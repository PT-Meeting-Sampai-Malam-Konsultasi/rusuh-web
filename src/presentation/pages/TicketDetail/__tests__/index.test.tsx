import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TicketDetailControllerInterface } from '@controllers/ticket-detail.controller';

import TicketDetailScreen from '../index';

let controller: TicketDetailControllerInterface;

vi.mock('@infrastructure/di/container', () => ({ default: { resolve: () => controller } }));
vi.mock('@infrastructure/di/controllers/ticket-detail', () => ({}));

const stub = (id: string, n: number) => ({
  id,
  label: `Tiket ${n}/2`,
  posterTitle: 'Samudra',
  posterTone: 'blue' as const,
  category: 'Festival B',
  holder: `Holder ${n}`,
  nikMasked: '3174 •••• •••• 0004',
  entry: 'Gerbang 5 · berdiri',
  doorsOpen: 'Sab, 12 Des · 16.00 WIB',
  code: `SMD-FB-0482${n}`,
  qrPayload: 'q',
  qr: [[true]],
  qrLabel: `QR tiket SMD-FB-0482${n}`,
});

const base = (): TicketDetailControllerInterface => ({
  t: ((key: string) => key) as never,
  status: 'ready',
  ticket: {
    stamp: 'Lunas · 12.07 WIB',
    heading: 'Sampai jumpa di GBK!',
    lead: '2 tiket SAMUDRA sudah atas nama pemegang NIK masing-masing.',
    orderCode: 'RSH-26-084731',
    total: 'Rp 2.180.000',
    method: 'QRIS',
    stubs: [stub('t1', 1), stub('t2', 2)],
  },
  email: 'nadia.saputri@gmail.com',
  printTickets: vi.fn(),
  calendar: {
    googleUrl: 'https://calendar.google.com/x',
    outlookUrl: 'https://outlook.live.com/x',
    downloadIcs: vi.fn(),
    onPick: vi.fn(),
  },
  errorMessage: '',
  retry: vi.fn(),
  ticketsHref: '/tickets',
  locale: 'id',
  setLocale: vi.fn(),
  nav: [{ href: '/tickets', label: 'nav_tickets', icon: 'tickets', current: true, desktop: true }],
});

describe('TicketDetailScreen', () => {
  beforeEach(() => {
    controller = base();
  });

  it('shows the paid order, a stub per ticket with its QR, and the gate rules', () => {
    render(<TicketDetailScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sampai jumpa di GBK!');
    expect(screen.getByText('✓ Lunas · 12.07 WIB')).toBeInTheDocument();
    expect(screen.getByText(/ticket_lead_email/)).toHaveTextContent('nadia.saputri@gmail.com');
    expect(screen.getByText(/ticket_order/)).toHaveTextContent('ticket_order RSH-26-084731 · Rp 2.180.000 · QRIS');
    const stubs = screen.getByRole('region', { name: 'ticket_stubs_label' });
    expect(stubs.querySelectorAll('article')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'QR tiket SMD-FB-04822' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'ticket_gate_title' })).toHaveTextContent('ticket_gate_ktp');
  });

  it('prints the PDF and offers the calendar menu', async () => {
    render(<TicketDetailScreen />);
    await userEvent.click(screen.getByRole('button', { name: /ticket_download/ }));
    expect(controller.printTickets).toHaveBeenCalled();
    expect(screen.getByText('ticket_calendar')).toBeInTheDocument();
  });

  it('leaves out the e-mail, the calendar and the order code when they are missing', () => {
    const ticket = controller.ticket!;
    controller = { ...base(), email: '', calendar: null, ticket: { ...ticket, orderCode: '', method: '' } };
    render(<TicketDetailScreen />);
    expect(screen.queryByText(/ticket_lead_email/)).not.toBeInTheDocument();
    expect(screen.queryByText('ticket_calendar')).not.toBeInTheDocument();
    expect(screen.getByText(/ticket_order/)).toHaveTextContent(/^ticket_order Rp 2\.180\.000$/);
  });

  it('shows loading, not found, not paid and error states', async () => {
    controller = { ...base(), status: 'loading', ticket: null };
    const loading = render(<TicketDetailScreen />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    loading.unmount();

    controller = { ...base(), status: 'not-found', ticket: null };
    const notFound = render(<TicketDetailScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ticket_not_found_title');
    expect(screen.getByRole('link', { name: 'ticket_all_tickets' })).toHaveAttribute('href', '/tickets');
    notFound.unmount();

    controller = { ...base(), status: 'not-paid', ticket: null };
    const notPaid = render(<TicketDetailScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ticket_not_paid_title');
    notPaid.unmount();

    controller = { ...base(), status: 'error', ticket: null, errorMessage: 'Layanan gangguan' };
    render(<TicketDetailScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('Layanan gangguan');
    await userEvent.click(screen.getByRole('button', { name: 'action_retry' }));
    expect(controller.retry).toHaveBeenCalled();
  });
});
