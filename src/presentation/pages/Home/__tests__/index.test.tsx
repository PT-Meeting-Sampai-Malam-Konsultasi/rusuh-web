import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HomeControllerInterface } from '@controllers/home.controller';
import type { EventCardView } from '@utils/format/event-card';

import HomeScreen from '../index';

const card = (id: string, name: string): EventCardView => ({
  id,
  state: 'on_sale',
  name,
  title: name,
  posterTone: 'blue',
  posterDate: '12.12.26',
  posterPlace: 'GBK',
  stamp: { tone: 'on', label: 'Antrian dibuka' },
  dateLine: 'Sab, 12 Des 2026 · 19.00 WIB',
  venueLine: 'GBK',
  price: null,
  outcome: null,
  note: null,
  finished: false,
  join: null,
});

let controller: HomeControllerInterface;

vi.mock('@infrastructure/di/container', () => ({ default: { resolve: () => controller } }));

const base = (): HomeControllerInterface => ({
  t: ((k: string) => k) as never,
  status: 'ready',
  featured: card('evt_samudra', 'Samudra'),
  events: [card('evt_deru', 'Deru'), card('evt_rimba', 'Rimba')],
  countLabel: '3 event',
  errorMessage: '',
  retry: vi.fn(),
  locale: 'id',
  setLocale: vi.fn(),
  joinHint: 'home_join_hint',
  selectEvent: vi.fn(),
  nav: [
    { href: '/', label: 'nav_events', icon: 'events', current: true, desktop: true },
    { href: '/queue', label: 'nav_queue', icon: 'queue', current: false, desktop: false },
  ],
});

describe('HomeScreen', () => {
  beforeEach(() => {
    controller = base();
  });

  it('renders the featured poster and the list', () => {
    render(<HomeScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('SAMUDRA');
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Deru', 'Rimba']);
    expect(screen.getByText('3 event')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'nav_app_label' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  });

  it('makes the list the page heading when nothing is featured, and skips an empty list', () => {
    controller = { ...base(), featured: null };
    const { rerender } = render(<HomeScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('home_all_events');
    controller = { ...base(), events: [] };
    rerender(<HomeScreen />);
    expect(screen.queryByText('home_all_events')).toBeNull();
  });

  it('passes the join link and hint to the featured poster', () => {
    controller = {
      ...base(),
      featured: {
        ...card('evt_samudra', 'Samudra'),
        join: { href: '/queue?event=evt_samudra', label: 'home_join_queue' },
      },
    };
    render(<HomeScreen />);
    expect(screen.getByRole('link', { name: /home_join_queue/ })).toHaveAttribute('href', '/queue?event=evt_samudra');
    expect(screen.getByText('home_join_hint')).toBeInTheDocument();
  });

  it('shows the skeleton while loading', () => {
    controller = { ...base(), status: 'loading', featured: null, events: [] };
    render(<HomeScreen />);
    expect(screen.getByRole('status', { name: 'state_loading' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the error with retry', () => {
    controller = { ...base(), status: 'error', featured: null, events: [], errorMessage: 'error_network_error' };
    render(<HomeScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('error_network_error');
    screen.getByRole('button', { name: 'action_retry' }).click();
    expect(controller.retry).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state', () => {
    controller = { ...base(), status: 'empty', featured: null, events: [] };
    render(<HomeScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('home_empty_title');
  });
});
