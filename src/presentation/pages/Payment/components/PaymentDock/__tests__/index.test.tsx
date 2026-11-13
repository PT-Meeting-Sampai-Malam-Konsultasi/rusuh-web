import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { payView } from '../../../__tests__/fixtures';
import PaymentDock from '../index';

describe('PaymentDock', () => {
  it('is a region named by dockRegionLabel with the dock label button', async () => {
    const pay = payView();
    render(<PaymentDock pay={pay} notice={null} />);
    const region = screen.getByRole('region', { name: 'payment_dock_label' });
    const button = within(region).getByRole('button', { name: 'payment_pay_amount' });
    expect(within(button).getByText('→')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(button);
    expect(pay.onPay).toHaveBeenCalledTimes(1);
  });

  it('reads the busy label, disabled and aria-busy, while busy', async () => {
    const pay = payView({ busy: true, enabled: false });
    render(<PaymentDock pay={pay} notice={null} />);
    const button = screen.getByRole('button', { name: 'payment_pay_busy' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(pay.onPay).not.toHaveBeenCalled();
  });

  it('shows an error notice above the button as an alert that describes it', () => {
    render(<PaymentDock pay={payView({ dockLabel: 'action_retry' })} notice={{ text: 'error_busy', tone: 'error' }} />);
    const alert = screen.getByRole('alert');
    const button = screen.getByRole('button', { name: 'action_retry' });
    expect(alert).toHaveTextContent('error_busy');
    expect(button).toHaveAccessibleDescription('error_busy');
    expect(alert.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows an info notice without the alert role', () => {
    render(<PaymentDock pay={payView()} notice={{ text: 'info', tone: 'info' }} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('info')).toBeInTheDocument();
  });

  describe('styles', () => {
    const css = readFileSync(join(__dirname, '..', 'payment-dock.module.css'), 'utf8');
    const rule = (name: string) => {
      const start = css.indexOf(`.${name} {`);
      return css.slice(start, css.indexOf('\n}\n', start));
    };

    it('starts with the @reference to the app styles', () => {
      expect(css.split('\n')[0]).toBe('@reference "../../../../../styles/app.css";');
    });

    it('is fixed to the bottom on phones and hidden from md, with a phone-only spacer', () => {
      expect(rule('dock')).toContain('fixed inset-x-0 bottom-0');
      expect(rule('dock')).toContain('env(safe-area-inset-bottom)');
      expect(rule('dock')).toMatch(/@variant md \{\s*@apply hidden;/);
      expect(rule('spacer')).toMatch(/@variant md \{\s*@apply hidden;/);
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });
  });
});
