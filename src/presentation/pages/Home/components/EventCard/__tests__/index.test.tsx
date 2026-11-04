import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EventCardView } from '@utils/format/event-card';

import EventCard from '../index';

const CARD: EventCardView = {
  id: 'evt_langit',
  name: 'Langit Sore',
  subtitle: 'Senja Panjang',
  title: 'Langit Sore — Senja Panjang',
  kicker: 'Live',
  posterTone: 'pink',
  posterDate: '09.01.27',
  posterPlace: 'KRIDOSONO · YOGYAKARTA',
  stamp: { tone: 'soon', label: 'Segera dijual' },
  dateLine: 'Sab, 9 Jan 2027 · 18.30 WIB',
  venueLine: 'Stadion Kridosono, Yogyakarta',
  price: { label: 'Mulai', amount: 'Rp 325.000' },
  outcome: null,
  note: { lead: 'Dibuka', strong: 'Jum, 30 Okt · 10.00 WIB', detail: '7 hari 14 jam lagi' },
  finished: false,
};

const renderCard = (event: EventCardView, index = 0) =>
  render(
    <ol>
      <EventCard event={event} index={index} />
    </ol>,
  );

describe('EventCard', () => {
  it('shows the stamp, title, date, venue, price and opening note', () => {
    renderCard(CARD);
    expect(screen.getByRole('listitem')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Langit Sore — Senja Panjang');
    expect(screen.getByText('Segera dijual')).toBeInTheDocument();
    expect(screen.getByText(/Sab, 9 Jan 2027/)).toHaveTextContent('Stadion Kridosono, Yogyakarta');
    expect(screen.getByText('Rp 325.000')).toBeInTheDocument();
    expect(screen.getByText('Jum, 30 Okt · 10.00 WIB')).toBeInTheDocument();
    expect(screen.getByText('7 hari 14 jam lagi')).toBeInTheDocument();
  });

  it('shows the outcome instead of a price once the sale is over', () => {
    renderCard(
      {
        ...CARD,
        stamp: { tone: 'sold', label: 'Habis terjual' },
        price: null,
        outcome: 'Semua 12.000 tiket terjual dalam 41 menit.',
        note: null,
        finished: true,
      },
      1,
    );
    expect(screen.getByText('Semua 12.000 tiket terjual dalam 41 menit.')).toBeInTheDocument();
    expect(screen.queryByText('Mulai')).toBeNull();
  });

  it('shows a note without a time', () => {
    renderCard({ ...CARD, note: { lead: 'Sisa tiket sedang dibayar pembeli lain.' } });
    expect(screen.getByText(/Sisa tiket sedang dibayar/)).toBeInTheDocument();
  });
});
