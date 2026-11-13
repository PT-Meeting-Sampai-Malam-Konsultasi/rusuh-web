import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OrderCheckoutView, OrderSummaryView } from '@controllers/order.controller';
import en from '@translation/locale/en.json';
import id from '@translation/locale/id.json';

import OrderDock from '../index';

const summary = (): OrderSummaryView => ({
  heading: 'order_summary_heading',
  lines: [{ key: 'cat_fb', label: '3 × Festival B', amount: 'Rp 2.150.000' }],
  feeLabel: 'order_summary_fee',
  fee: 'Rp 10.000',
  totalLabel: 'order_summary_total',
  total: 'Rp 2.160.000',
  note: 'order_summary_note',
  ticketCount: '3 tiket',
  dockLabel: 'order_summary_dock_label',
});

const checkout = (over: Partial<OrderCheckoutView> = {}): OrderCheckoutView => ({
  label: 'order_checkout_label',
  shortLabel: 'order_checkout_short_label',
  enabled: true,
  busy: false,
  hint: null,
  onContinue: vi.fn(),
  ...over,
});

describe('OrderDock', () => {
  it('is a region named by dockLabel with the count, the total and the short button', () => {
    render(<OrderDock summary={summary()} checkout={checkout()} />);
    const dock = screen.getByRole('region', { name: 'order_summary_dock_label' });
    expect(within(dock).getByText('3 tiket')).toBeInTheDocument();
    expect(within(dock).getByText('Rp 2.160.000')).toBeInTheDocument();
    const button = within(dock).getByRole('button', { name: 'order_checkout_short_label' });
    expect(within(button).getByText('→')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText('order_checkout_label')).toBeNull();
  });

  it('renders an aria-hidden spacer before the dock', () => {
    const { container } = render(<OrderDock summary={summary()} checkout={checkout()} />);
    const spacer = container.firstElementChild as HTMLElement;
    expect(spacer).toHaveAttribute('aria-hidden', 'true');
    expect(spacer).toBeEmptyDOMElement();
    expect(spacer.nextElementSibling).toBe(screen.getByRole('region'));
  });

  it('calls onContinue once on a click when enabled, with no description', async () => {
    const view = checkout();
    render(<OrderDock summary={summary()} checkout={view} />);
    const button = screen.getByRole('button');
    expect(button).not.toHaveAttribute('aria-describedby');
    await userEvent.click(button);
    expect(view.onContinue).toHaveBeenCalledTimes(1);
  });

  it('is disabled with a neutral hint above the row that describes the button', () => {
    render(
      <OrderDock
        summary={summary()}
        checkout={checkout({ enabled: false, hint: { text: 'order_checkout_hint_holders', error: false } })}
      />,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('order_checkout_hint_holders');
    expect(screen.queryByRole('alert')).toBeNull();
    const hint = screen.getByText('order_checkout_hint_holders');
    expect(hint.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows a refusal hint as an alert', () => {
    render(
      <OrderDock
        summary={summary()}
        checkout={checkout({ enabled: false, hint: { text: 'order_hold_over_reservation', error: true } })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('order_hold_over_reservation');
    expect(screen.getByRole('button')).toHaveAccessibleDescription('order_hold_over_reservation');
  });

  it('is disabled and aria-busy while the hold is in flight', async () => {
    const view = checkout({ enabled: false, busy: true });
    render(<OrderDock summary={summary()} checkout={view} />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(view.onContinue).not.toHaveBeenCalled();
  });

  it.each([
    { locale: 'id', strings: id, region: 'Ringkasan pesanan', button: 'Lanjut bayar' },
    { locale: 'en', strings: en, region: 'Order summary', button: 'Continue' },
  ])('reads the real $locale copy', ({ strings, region, button }) => {
    render(
      <OrderDock
        summary={{ ...summary(), dockLabel: strings.order_summary_dock_label }}
        checkout={checkout({ shortLabel: strings.order_checkout_short_label })}
      />,
    );
    expect(screen.getByRole('region', { name: region })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: button })).toBeInTheDocument();
  });

  describe('styles', () => {
    const css = readFileSync(join(__dirname, '..', 'order-dock.module.css'), 'utf8');
    const rule = (name: string) => {
      const start = css.indexOf(`.${name} {`);
      const next = css.indexOf('\n}\n', start);
      return css.slice(start, next);
    };

    it('starts with the @reference to the app styles', () => {
      expect(css.split('\n')[0]).toBe('@reference "../../../../../styles/app.css";');
    });

    it('is a fixed paper bar on phones, hidden from md, with a 130px phone spacer', () => {
      const dock = rule('dock');
      expect(dock).toContain('fixed inset-x-0 bottom-0');
      expect(dock).toContain('border-t-[2.5px] border-ink bg-paper px-4 pt-3');
      expect(dock).toContain('calc(14px + env(safe-area-inset-bottom))');
      expect(dock.slice(dock.indexOf('@variant md'))).toContain('hidden');
      const spacer = rule('spacer');
      expect(spacer).toContain('h-[130px]');
      expect(spacer.slice(spacer.indexOf('@variant md'))).toContain('hidden');
    });

    it('caps the button at 210px, tabular total, no hex', () => {
      expect(rule('row')).toContain('max-w-[210px] flex-1 px-4');
      expect(rule('amount')).toContain('tabular-nums');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });
  });
});
