import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LoadingOverlay from '../index';

describe('LoadingOverlay', () => {
  it('renders only when visible', () => {
    const { rerender } = render(<LoadingOverlay visible={false} label="Memuat…" />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<LoadingOverlay visible label="Memuat…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Memuat…');
  });
});
