import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import en from '@translation/locale/en.json';
import id from '@translation/locale/id.json';

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

  it('has no data-compact attribute without compact', () => {
    render(<Timer seconds={252} label="x" />);
    const timer = screen.getByRole('timer');
    expect(timer).not.toHaveAttribute('data-compact');
    expect(timer.getAttributeNames().sort()).toEqual(['aria-live', 'class', 'role']);
    expect(timer.children).toHaveLength(2);
  });

  it('marks the compact form and keeps the value and the label in the DOM', () => {
    render(<Timer seconds={252} label="sisa waktu memilih" compact />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('data-compact', 'true');
    expect(timer).toHaveTextContent('4:12');
    expect(screen.getByText('sisa waktu memilih')).toBeInTheDocument();
    expect(timer).toContainElement(screen.getByText('sisa waktu memilih'));
  });

  it.each([
    { seconds: 61, live: 'off', text: '1:01' },
    { seconds: 60, live: 'polite', text: '1:00' },
    { seconds: 0, live: 'polite', text: '0:00' },
  ])('keeps the warning rule with compact: $seconds s is $live', ({ seconds, live, text }) => {
    render(<Timer seconds={seconds} compact />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('aria-live', live);
    expect(timer).toHaveTextContent(text);
    expect(timer).toHaveAttribute('data-compact');
  });

  it('warns at 60 and not at 61 seconds without compact too', () => {
    const { unmount } = render(<Timer seconds={60} />);
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'polite');
    unmount();
    render(<Timer seconds={61} />);
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'off');
  });

  it.each([
    { locale: 'id', label: id.order_timer_label, expected: 'sisa waktu memilih' },
    { locale: 'en', label: en.order_timer_label, expected: 'left to choose' },
  ])('shows the order timer label in $locale', ({ label, expected }) => {
    render(<Timer seconds={252} label={label} compact />);
    expect(screen.getByRole('timer')).toHaveTextContent(`4:12${expected}`);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
