import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QueueControllerInterface } from '@controllers/queue.controller';

import QueueScreen from '../index';

let controller: QueueControllerInterface;

vi.mock('@infrastructure/di/container', () => ({ default: { resolve: () => controller } }));
vi.mock('@infrastructure/di/controllers/queue', () => ({}));

const t = ((k: string, params?: Record<string, unknown>) => (params ? `${k}:${JSON.stringify(params)}` : k)) as never;

const base = (): QueueControllerInterface => ({
  t,
  status: 'waiting',
  event: {
    name: 'Pelita',
    subtitle: 'Tur Kota Lama',
    posterTone: 'blue',
    posterDate: '04.12.26',
    posterPlace: 'SIMPANG LIMA · SEMARANG',
    dateLine: 'Jum, 4 Des 2026 · 19.30 WIB',
    venueLine: 'Lapangan Simpang Lima, Semarang',
    kicker: 'LIVE · Antrian dibuka',
  },
  waiting: {
    position: '1.248',
    progress: 45.7,
    served: '18.452',
    seq: '19.700',
    updated: 'Diperbarui 2 detik lalu',
    rate: '300 orang masuk / menit',
  },
  prequeue: null,
  paused: null,
  errorMessage: '',
  retry: vi.fn(),
  locale: 'id',
  setLocale: vi.fn(),
  nav: [
    { href: '/', label: 'nav_events', icon: 'events', current: false, desktop: true },
    { href: '/queue', label: 'nav_queue', icon: 'queue', current: true, desktop: false },
  ],
  homeHref: '/',
});

describe('QueueScreen', () => {
  beforeEach(() => {
    controller = base();
  });

  it('shows the number, the track and the notes while waiting, under one page heading', () => {
    render(<QueueScreen />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('queue_title: Pelita');
    expect(screen.getByText('queue_lead_position')).toBeInTheDocument();
    expect(screen.getAllByText('1.248')).toHaveLength(2);
    const track = screen.getByRole('progressbar', { name: 'queue_track_label' });
    expect(track).toHaveAttribute('aria-valuenow', '45.7');
    expect(track.style.getPropertyValue('--p')).toBe('45.7%');
    expect(screen.getByText('queue_number:{"number":"18.452"}')).toBeInTheDocument();
    const live = screen.getByText(/Diperbarui 2 detik lalu/);
    expect(live).toHaveTextContent('Diperbarui 2 detik lalu · 300 orang masuk / menit');
    expect(live).toHaveAttribute('aria-live', 'off');
    expect(screen.getByRole('region', { name: 'queue_notes_label' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'queue_title' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  });

  it('shows only when it was updated while there is no rate yet', () => {
    controller = { ...base(), waiting: { ...base().waiting!, updated: 'Baru saja diperbarui', rate: null } };
    render(<QueueScreen />);
    expect(screen.getByText('Baru saja diperbarui')).toHaveTextContent(/^Baru saja diperbarui$/);
  });

  it('shows the joining view with the Turnstile slot while the number is fetched', () => {
    controller = { ...base(), status: 'joining', waiting: null };
    const { container } = render(<QueueScreen />);
    expect(screen.getByText('queue_joining_title')).toBeInTheDocument();
    expect(container.querySelector('#turnstile-slot')).not.toBeNull();
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('region', { name: 'queue_notes_label' })).toBeNull();
  });

  it('counts down before the draw', () => {
    controller = {
      ...base(),
      status: 'prequeue',
      waiting: null,
      prequeue: { countdown: '8:42', opensAt: '10.00 WIB' },
    };
    render(<QueueScreen />);
    expect(screen.getByRole('timer')).toHaveTextContent('8:42');
    expect(screen.getByText('queue_prequeue_body:{"time":"10.00 WIB"}')).toBeInTheDocument();
  });

  it('says the numbers come at opening when there is no opening time', () => {
    controller = { ...base(), status: 'prequeue', waiting: null, prequeue: null };
    render(<QueueScreen />);
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.getByText('queue_prequeue_body_plain')).toBeInTheDocument();
  });

  it('keeps the number while paused and says why', () => {
    controller = {
      ...base(),
      status: 'paused',
      waiting: null,
      paused: { position: '1.248', reason: 'home_temporarily_full_note' },
    };
    render(<QueueScreen />);
    expect(screen.getByText('queue_paused_lead')).toBeInTheDocument();
    expect(screen.getByText('home_temporarily_full_note')).toBeInTheDocument();
  });

  it('pauses without a number before the draw', () => {
    controller = { ...base(), status: 'paused', waiting: null, paused: { position: null, reason: 'x' } };
    render(<QueueScreen />);
    expect(screen.getByText('queue_paused_lead_plain')).toBeInTheDocument();
  });

  it('closes the queue when sold out: stamped poster, no notes, a way to other events', () => {
    controller = { ...base(), status: 'sold-out', waiting: null };
    render(<QueueScreen />);
    expect(screen.getByText('queue_soldout_lead:{"name":"PELITA"}')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('queue_soldout_title');
    expect(screen.getByText('home_sold_out_overlay')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('link', { name: /queue_other_events/ })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('region', { name: 'queue_notes_label' })).toBeNull();
  });

  it('says sold out without the event name when the event is not listed', () => {
    controller = { ...base(), status: 'sold-out', waiting: null, event: null };
    render(<QueueScreen />);
    expect(screen.getByText('queue_soldout_lead_plain')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('queue_title');
  });

  it.each([
    ['no-event', 'queue_no_event_title'],
    ['not-found', 'queue_not_found_title'],
    ['elsewhere', 'queue_elsewhere_title'],
  ] as const)('shows %s as a message with a way home', (status, title) => {
    controller = { ...base(), status, waiting: null };
    render(<QueueScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
    expect(screen.getByRole('link', { name: 'queue_other_events' })).toHaveAttribute('href', '/');
    expect(within(screen.getByRole('main')).queryByRole('button')).toBeNull();
  });

  it('offers a retry after a failure', async () => {
    const retry = vi.fn();
    controller = { ...base(), status: 'error', waiting: null, errorMessage: 'error_rate_limited', retry };
    render(<QueueScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('error_rate_limited');
    await userEvent.click(screen.getByRole('button', { name: 'action_retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'action_back_home' })).toBeInTheDocument();
  });
});
