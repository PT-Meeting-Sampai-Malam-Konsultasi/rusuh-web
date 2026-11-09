import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { OrderEventView } from '@utils/format/order-event';

import OrderEventHeader from '../index';

const event: OrderEventView = {
  id: 'evt_samudra',
  name: 'Samudra',
  subtitle: 'Tur Gelombang 2026',
  posterTone: 'blue',
  metaLine: 'Sab, 12 Des 2026 · 19.00 WIB · Stadion Utama GBK, Jakarta',
};

describe('OrderEventHeader', () => {
  it('shows the name and subtitle as the page heading, and the meta line', () => {
    render(<OrderEventHeader event={event} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Samudra Tur Gelombang 2026');
    expect(screen.getByText('Sab, 12 Des 2026 · 19.00 WIB · Stadion Utama GBK, Jakarta')).toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  it('shows the name only without a subtitle', () => {
    render(<OrderEventHeader event={{ ...event, subtitle: undefined }} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Samudra');
  });

  it('loads the artwork eagerly with an empty alt', () => {
    const { container } = render(<OrderEventHeader event={{ ...event, imageUrl: '/posters/samudra.webp' }} />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/posters/samudra.webp');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('loading', 'eager');
  });
});
