import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { EventCardView } from '@utils/format/event-card';

import EventList from '../index';

const CARD: EventCardView = {
  id: 'evt_langit',
  state: 'coming_soon',
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
  overlay: null,
  join: null,
};

const t = ((k: string) => k) as never;

describe('EventList', () => {
  it('lists every event under the section heading with the count', () => {
    render(
      <EventList
        t={t}
        events={[CARD, { ...CARD, id: 'evt_rimba', title: 'Rimba' }]}
        countLabel="5 event"
        isMainHeading={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('home_all_events');
    expect(screen.getByText('5 event')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('becomes the page heading when there is no featured event', () => {
    render(<EventList t={t} events={[CARD]} countLabel="1 event" isMainHeading onSelect={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('home_all_events');
  });
});
