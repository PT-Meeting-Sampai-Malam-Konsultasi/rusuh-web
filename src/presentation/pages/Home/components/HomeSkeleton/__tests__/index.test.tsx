import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomeSkeleton from '../index';

describe('HomeSkeleton', () => {
  it('announces loading', () => {
    render(<HomeSkeleton label="Memuat…" />);
    expect(screen.getByRole('status', { name: 'Memuat…' })).toBeInTheDocument();
  });
});
