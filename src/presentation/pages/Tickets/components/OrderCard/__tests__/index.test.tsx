import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { MyOrderCardView } from '@utils/format/tickets';

import OrderCard from '..';

const t = ((key: string) => key) as never;
const order: MyOrderCardView = {
  bookingId: 'bk_1',
  href: '/tickets/detail?booking=bk_1',
  past: false,
  title: 'Samudra — Tur Gelombang 2026',
  posterTitle: 'Samudra',
  posterSubtitle: 'Tur Gelombang 2026',
  posterTone: 'blue',
  dateLine: 'Sab, 12 Des 2026 · 19.00 WIB · Stadion Utama GBK, Jakarta',
  day: '12',
  month: 'Des',
  daysLeft: '30 hari lagi',
  stubs: [
    { id: 't1', category: 'Festival B', holder: 'Nadia Saputri' },
    { id: 't2', category: 'Tribun Atas', holder: 'Raka Pratama' },
  ],
  ticketCount: '2 tiket',
  orderCode: 'RSH-26-084731',
  total: 'Rp 2.180.000',
};

const inList = (view: MyOrderCardView) =>
  render(
    <ol>
      <OrderCard t={t} order={view} />
    </ol>,
  );

describe('OrderCard', () => {
  it('shows the event, its tickets without NIK, the order and the date, linking to the e-ticket', () => {
    inList(order);
    expect(screen.getByText('✓ tickets_paid')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Samudra — Tur Gelombang 2026');
    expect(screen.getByRole('list', { name: '2 tiket' })).toHaveTextContent('Festival BNadia Saputri');
    expect(screen.getByText('RSH-26-084731')).toBeInTheDocument();
    expect(screen.getByText('Rp 2.180.000')).toBeInTheDocument();
    expect(screen.getByText('30 hari lagi')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tickets_view/ })).toHaveAttribute('href', '/tickets/detail?booking=bk_1');
    expect(screen.getByRole('link', { name: order.title })).toHaveAttribute('href', order.href);
  });

  it('marks a past order as ended, and leaves out what it does not have', () => {
    inList({ ...order, past: true, daysLeft: '', dateLine: '', day: '', orderCode: '' });
    expect(screen.getByText('tickets_ended')).toBeInTheDocument();
    expect(screen.queryByText('tickets_paid')).not.toBeInTheDocument();
    expect(screen.queryByText('Des')).not.toBeInTheDocument();
    expect(screen.queryByText('RSH-26-084731')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'tickets_view' })).toBeInTheDocument();
  });
});
