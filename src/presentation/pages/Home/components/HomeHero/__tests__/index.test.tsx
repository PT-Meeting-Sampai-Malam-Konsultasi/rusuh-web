import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EventCardView } from '@utils/format/event-card';

import HomeHero from '../index';

const LIVE: EventCardView = {
  id: 'evt_samudra',
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
};

const t = ((k: string) => k) as never;

describe('HomeHero', () => {
  it('shows the poster heading, stamp and facts', () => {
    render(<HomeHero t={t} event={LIVE} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('SAMUDRA');
    expect(screen.getByRole('region', { name: 'SAMUDRA' })).toBeInTheDocument();
    expect(screen.getByText('Antrian dibuka')).toBeInTheDocument();
    expect(screen.getByText('Sab, 12 Des 2026 · 19.00 WIB')).toBeInTheDocument();
    expect(screen.getByText('Stadion Utama GBK, Jakarta')).toBeInTheDocument();
    expect(screen.getByText('Rp 450.000')).toBeInTheDocument();
  });

  it('shows the opening note, or the outcome in place of a price', () => {
    const { rerender } = render(
      <HomeHero t={t} event={{ ...LIVE, note: { lead: 'Dibuka', strong: 'Jum, 30 Okt', detail: '2 jam lagi' } }} />,
    );
    expect(screen.getByText('Jum, 30 Okt')).toBeInTheDocument();
    expect(screen.getByText('2 jam lagi')).toBeInTheDocument();
    rerender(<HomeHero t={t} event={{ ...LIVE, price: null, outcome: 'Semua tiket sudah terjual.' }} />);
    expect(screen.getByText('Semua tiket sudah terjual.')).toBeInTheDocument();
    rerender(<HomeHero t={t} event={{ ...LIVE, price: null, subtitle: undefined }} />);
    expect(screen.queryByText('home_fact_price')).toBeNull();
  });
});
