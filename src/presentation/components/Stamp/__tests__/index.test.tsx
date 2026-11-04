import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Stamp from '../index';

describe('Stamp', () => {
  it('shows the status word', () => {
    render(<Stamp tone="sold">Habis terjual</Stamp>);
    expect(screen.getByText('Habis terjual')).toBeInTheDocument();
  });

  it('adds the live dot only to the open tone', () => {
    const { container, rerender } = render(<Stamp tone="on">Antrian dibuka</Stamp>);
    expect(container.querySelector('i')).toHaveAttribute('aria-hidden', 'true');
    rerender(<Stamp tone="soon">Segera dijual</Stamp>);
    expect(container.querySelector('i')).toBeNull();
  });
});
