import { fireEvent, render, screen } from '@testing-library/react';
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

  it('prints the title and plates over the artwork when the event has one', () => {
    const { container } = render(
      <Poster
        tone="pink"
        size="card"
        title="Deru"
        kicker="Live"
        subtitle="Malam Mesin"
        imageUrl="/posters/deru.webp"
      />,
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/posters/deru.webp');
    expect(img).toHaveAttribute('alt', '');
    expect(screen.getByText('DERU')).toBeVisible();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Malam Mesin')).toBeInTheDocument();
    expect(container.firstElementChild?.className).toMatch(/withImage/);
  });

  it('drops artwork that fails to load and stands as the printed poster', () => {
    const { container, rerender } = render(
      <Poster tone="blue" size="hero" title="Way Back Home" imageUrl="https://s3.example/placeholder.avif" />,
    );
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstElementChild?.className).not.toMatch(/withImage/);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.getByText('WAY BACK HOME')).toBeInTheDocument();
    // A different image is tried again.
    rerender(<Poster tone="blue" size="hero" title="Way Back Home" imageUrl="https://cdn.example/real.webp" />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.example/real.webp');
  });

  it('prints only the title at thumb size', () => {
    render(
      <Poster
        tone="blue"
        size="thumb"
        title="Samudra"
        kicker="Rusuh menghadirkan"
        subtitle="Tur Gelombang 2026"
        meta={{ date: '12.12.26', place: 'GBK' }}
      />,
    );
    expect(screen.getByText('SAMUDRA')).toBeInTheDocument();
    expect(screen.queryByText('Rusuh menghadirkan')).toBeNull();
    expect(screen.queryByText('Tur Gelombang 2026')).toBeNull();
    expect(screen.queryByText('12.12.26')).toBeNull();
  });

  it('loads thumb artwork eagerly at its own size when asked', () => {
    const { container } = render(
      <Poster tone="blue" size="thumb" title="Samudra" imageUrl="/posters/samudra.webp" loading="eager" />,
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('width', '84');
    expect(img).toHaveAttribute('height', '104');
  });

  it('lazy-loads artwork by default', () => {
    const { container } = render(<Poster tone="pink" size="card" title="Deru" imageUrl="/posters/deru.webp" />);
    expect(container.querySelector('img')).toHaveAttribute('loading', 'lazy');
  });
});
