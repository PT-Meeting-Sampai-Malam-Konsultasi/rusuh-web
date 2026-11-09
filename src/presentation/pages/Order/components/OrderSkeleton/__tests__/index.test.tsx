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
});
