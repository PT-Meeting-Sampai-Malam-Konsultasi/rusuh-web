import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { EventCardView } from '@utils/format/event-card';

import HomeHero from '../index';

const LIVE: EventCardView = {
  id: 'evt_samudra',
  state: 'on_sale',
  name: 'Samudra',
  subtitle: 'Tur Gelombang 2026',
  title: 'Samudra — Tur Gelombang 2026',
  kicker: 'Tour',
  posterTone: 'pink',
  posterDate: '12.12.26',
  posterPlace: 'GBK · JAKARTA',
  stamp: { tone: 'on', label: 'Antrian dibuka' },
  dateLine: 'Sab, 12 Des 2026 · 19.00 WIB',
  venueLine: 'Stadion Utama GBK, Jakarta',
  price: { label: 'Mulai', amount: 'Rp 450.000' },
  outcome: null,
  note: null,
  finished: false,
  join: { href: '/queue?event=evt_samudra', label: 'Masuk antrian' },
};

const t = ((k: string) => k) as never;
const props = { t, joinHint: 'Satu tempat antrian per perangkat.', onSelect: vi.fn() };

describe('HomeHero', () => {
  it('offers the queue for a live event, with the device hint, and reports the click', async () => {
    const onSelect = vi.fn();
    render(<HomeHero {...props} event={LIVE} onSelect={onSelect} />);
    const link = screen.getByRole('link', { name: /Masuk antrian/ });
    expect(link).toHaveAttribute('href', '/queue?event=evt_samudra');
    expect(screen.getByText('Satu tempat antrian per perangkat.')).toBeInTheDocument();
    link.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(link);
    expect(onSelect).toHaveBeenCalledWith('evt_samudra', 0);
  });

  it('has no call to action when the event cannot be joined', () => {
    render(<HomeHero {...props} event={{ ...LIVE, state: 'coming_soon', join: null }} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Satu tempat antrian per perangkat.')).toBeNull();
  });

  it('shows the poster heading, stamp and facts', () => {
    render(<HomeHero {...props} event={LIVE} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('SAMUDRA');
    expect(screen.getByRole('region', { name: 'SAMUDRA' })).toBeInTheDocument();
    expect(screen.getByText('Antrian dibuka')).toBeInTheDocument();
    expect(screen.getByText('Sab, 12 Des 2026 · 19.00 WIB')).toBeInTheDocument();
    expect(screen.getByText('Stadion Utama GBK, Jakarta')).toBeInTheDocument();
    expect(screen.getByText('Rp 450.000')).toBeInTheDocument();
  });

  it('shows the opening note, or the outcome in place of a price', () => {
    const { rerender } = render(
      <HomeHero
        {...props}
        event={{ ...LIVE, note: { lead: 'Dibuka', strong: 'Jum, 30 Okt', detail: '2 jam lagi' } }}
      />,
    );
    expect(screen.getByText('Jum, 30 Okt')).toBeInTheDocument();
    expect(screen.getByText('2 jam lagi')).toBeInTheDocument();
    rerender(<HomeHero {...props} event={{ ...LIVE, price: null, outcome: 'Semua tiket sudah terjual.' }} />);
    expect(screen.getByText('Semua tiket sudah terjual.')).toBeInTheDocument();
    rerender(<HomeHero {...props} event={{ ...LIVE, price: null, subtitle: undefined }} />);
    expect(screen.queryByText('home_fact_price')).toBeNull();
  });
});
