import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OfflineBanner from '../index';

describe('OfflineBanner', () => {
  it('announces only when offline', () => {
    const { rerender } = render(<OfflineBanner visible={false} message="Anda sedang offline." />);
    expect(screen.queryByText('Anda sedang offline.')).toBeNull();
    rerender(<OfflineBanner visible message="Anda sedang offline." />);
    expect(screen.getByText('Anda sedang offline.')).toBeInTheDocument();
  });
});
