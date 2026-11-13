import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { progressView } from '../../../__tests__/fixtures';
import PaymentProgress from '../index';

describe('PaymentProgress', () => {
  it('is a polite status region with the title, body and held line', () => {
    render(<PaymentProgress progress={progressView()} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(within(status).getByRole('heading', { level: 1, name: 'payment_verifying_title' })).toBeInTheDocument();
    expect(within(status).getByText('payment_verifying_body')).toBeInTheDocument();
    expect(within(status).getByText('payment_verifying_held')).toBeInTheDocument();
  });

  it('leaves out the held line when it is empty (paid)', () => {
    render(
      <PaymentProgress
        progress={progressView({ reason: 'paid', title: 'payment_paid_title', body: 'payment_paid_body', held: '' })}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'payment_paid_title' })).toBeInTheDocument();
    expect(screen.getByRole('status').querySelectorAll('p')).toHaveLength(1);
  });

  it('hides the spinner and stops it under reduced motion', () => {
    const { container } = render(<PaymentProgress progress={progressView()} />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    const css = readFileSync(join(__dirname, '..', 'payment-progress.module.css'), 'utf8');
    expect(css.split('\n')[0]).toBe('@reference "../../../../../styles/app.css";');
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*animation: spin/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
