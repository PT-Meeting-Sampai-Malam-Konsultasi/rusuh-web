import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OrderSkeleton from '../index';

describe('OrderSkeleton', () => {
  it('announces loading with visually hidden text and no heading', () => {
    render(<OrderSkeleton label="Memuat…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Memuat…');
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('main')).toBeNull();
  });

  it('renders the page frame as the route fallback', () => {
    render(<OrderSkeleton withHeader />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('draws four hidden category rows, each with price and stepper placeholders, and announces nothing else', () => {
    const { container } = render(<OrderSkeleton label="Memuat…" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/^Memuat…$/);
    const section = status.querySelectorAll('[aria-hidden="true"]')[1];
    expect(section.children).toHaveLength(5);
    Array.from(section.children)
      .slice(1)
      .forEach((row) => expect(row.children).toHaveLength(4));
    expect(container.querySelector('li, ul, button, output')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
