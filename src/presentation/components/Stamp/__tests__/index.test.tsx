import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Stamp from '../index';

describe('Stamp', () => {
  it('shows the status word', () => {
    render(<Stamp tone="sold">Habis terjual</Stamp>);
    expect(screen.getByText('Habis terjual')).toBeInTheDocument();
  });
});
