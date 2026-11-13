import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { messageView } from '../../../__tests__/fixtures';
import PaymentMessage from '../index';

describe('PaymentMessage', () => {
  it('shows the title, body and home link, with no note and no retry', () => {
    render(<PaymentMessage message={messageView()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'payment_inactive_title' })).toBeInTheDocument();
    expect(screen.getByText('payment_inactive_body')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'action_back_home' })).toHaveAttribute('href', '/');
    expect(screen.queryByText('payment_inactive_refund')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the refund note when given', () => {
    render(<PaymentMessage message={messageView({ note: 'payment_inactive_refund' })} />);
    expect(screen.getByText('payment_inactive_refund')).toBeInTheDocument();
  });

  it('offers retry on the load error, with the body as an alert', async () => {
    const onAction = vi.fn();
    render(
      <PaymentMessage
        message={messageView({
          title: 'payment_error_title',
          body: 'error_network_error',
          actionLabel: 'action_retry',
          onAction,
        })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('error_network_error');
    await userEvent.click(screen.getByRole('button', { name: 'action_retry' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'action_back_home' })).toBeInTheDocument();
  });

  it('starts its CSS module with the @reference and draws the note as a quiet ink box', () => {
    const css = readFileSync(join(__dirname, '..', 'payment-message.module.css'), 'utf8');
    expect(css.split('\n')[0]).toBe('@reference "../../../../../styles/app.css";');
    expect(css).toContain('border-[2.5px] border-ink bg-card');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
