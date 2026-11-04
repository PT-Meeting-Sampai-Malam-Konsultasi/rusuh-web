import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Poster from '../index';

describe('Poster', () => {
  it('prints the title, kicker, subtitle and hero meta', () => {
    render(
      <Poster
        tone="blue"
        size="hero"
        title="Samudra"
        kicker="Rusuh menghadirkan"
        subtitle="Tur Gelombang 2026"
        meta={{ date: '12.12.26', place: 'GBK · JAKARTA' }}
        titleAs="h1"
        titleId="hero-title"
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('SAMUDRA');
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('id', 'hero-title');
    expect(screen.getByText('Tur Gelombang 2026')).toBeInTheDocument();
    expect(screen.getByText('12.12.26')).toBeInTheDocument();
    expect(screen.getByText('GBK · JAKARTA')).toBeInTheDocument();
  });

  it('shows the artwork when the event has one, keeping the title for screen readers', () => {
    const { container } = render(<Poster tone="pink" size="card" title="Deru" imageUrl="/posters/deru.webp" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/posters/deru.webp');
    expect(screen.getByText('Deru')).toBeInTheDocument();
  });
});
