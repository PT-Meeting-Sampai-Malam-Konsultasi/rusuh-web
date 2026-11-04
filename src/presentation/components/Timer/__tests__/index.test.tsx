import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Timer, { formatSeconds } from '../index';

describe('Timer', () => {
  it('formats minutes and seconds', () => {
    expect(formatSeconds(252)).toBe('4:12');
    expect(formatSeconds(5)).toBe('0:05');
    expect(formatSeconds(-3)).toBe('0:00');
  });

  it('renders the time and label as a timer', () => {
    render(<Timer seconds={252} label="sisa waktu memilih" />);
    expect(screen.getByRole('timer')).toHaveTextContent('4:12');
    expect(screen.getByText('sisa waktu memilih')).toBeInTheDocument();
  });

  it('announces when in the warning zone', () => {
    render(<Timer seconds={30} warnAt={60} />);
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'polite');
  });
});
