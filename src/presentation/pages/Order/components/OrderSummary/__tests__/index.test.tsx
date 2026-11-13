import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OrderCheckoutView, OrderSummaryView } from '@controllers/order.controller';
import en from '@translation/locale/en.json';
import id from '@translation/locale/id.json';

import OrderSummary from '../index';

const summary = (): OrderSummaryView => ({
  heading: 'order_summary_heading',
  lines: [
    { key: 'cat_fb', label: '2 × Festival B', amount: 'Rp 1.700.000' },
    { key: 'cat_tb', label: '1 × Tribun Bawah', amount: 'Rp 450.000' },
  ],
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

describe('OrderSummary', () => {
  it('is a complementary landmark named by its h2, with lines, fee, total, button and note in order', () => {
    render(<OrderSummary summary={summary()} checkout={checkout()} />);
    const aside = screen.getByRole('complementary', { name: 'order_summary_heading' });
    expect(within(aside).getByRole('heading', { level: 2 })).toHaveTextContent('order_summary_heading');
    const items = within(aside).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('2 × Festival B');
    expect(items[0]).toHaveTextContent('Rp 1.700.000');
    expect(items[1]).toHaveTextContent('1 × Tribun Bawah');
    expect(items[1]).toHaveTextContent('Rp 450.000');
    expect(within(aside).getByText('order_summary_fee').parentElement).toHaveTextContent('Rp 10.000');
    expect(within(aside).getByText('order_summary_total').parentElement).toHaveTextContent('Rp 2.160.000');
    const button = within(aside).getByRole('button', { name: 'order_checkout_label' });
    expect(within(button).getByText('→')).toHaveAttribute('aria-hidden', 'true');
    const note = within(aside).getByText('order_summary_note');
    expect(aside.textContent?.indexOf('Rp 2.160.000')).toBeLessThan(
      aside.textContent?.indexOf('order_checkout_label') ?? 0,
    );
    expect(button.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('calls onContinue once on a click when enabled, with no description', async () => {
    const view = checkout();
    render(<OrderSummary summary={summary()} checkout={view} />);
    const button = screen.getByRole('button', { name: 'order_checkout_label' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-describedby');
    await userEvent.click(button);
    expect(view.onContinue).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is disabled with a neutral hint (no alert) that describes the button', async () => {
    const view = checkout({ enabled: false, hint: { text: 'order_checkout_hint_holders', error: false } });
    render(<OrderSummary summary={summary()} checkout={view} />);
    const button = screen.getByRole('button', { name: 'order_checkout_label' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('order_checkout_hint_holders');
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.click(button);
    expect(view.onContinue).not.toHaveBeenCalled();
  });

  it('shows a refusal hint as an alert that describes the button', () => {
    render(
      <OrderSummary
        summary={summary()}
        checkout={checkout({ enabled: false, hint: { text: 'order_hold_sold_out', error: true } })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('order_hold_sold_out');
    expect(screen.getByRole('button', { name: 'order_checkout_label' })).toHaveAccessibleDescription(
      'order_hold_sold_out',
    );
  });

  it('is disabled and aria-busy while the hold is in flight', async () => {
    const view = checkout({ enabled: false, busy: true });
    render(<OrderSummary summary={summary()} checkout={view} />);
    const button = screen.getByRole('button', { name: 'order_checkout_label' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(view.onContinue).not.toHaveBeenCalled();
  });

  it.each([
    { locale: 'id', strings: id, button: 'Lanjut ke pembayaran', heading: 'Ringkasan' },
    { locale: 'en', strings: en, button: 'Continue to payment', heading: 'Summary' },
  ])('reads the real $locale copy', ({ strings, button, heading }) => {
    render(
      <OrderSummary
        summary={{
          ...summary(),
          heading: strings.order_summary_heading,
          feeLabel: strings.order_summary_fee,
          note: strings.order_summary_note,
        }}
        checkout={checkout({ label: strings.order_checkout_label })}
      />,
    );
    expect(screen.getByRole('complementary', { name: heading })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: button })).toBeInTheDocument();
    expect(screen.getByText(strings.order_summary_note)).toBeInTheDocument();
  });

  describe('styles', () => {
    const css = readFileSync(join(__dirname, '..', 'order-summary.module.css'), 'utf8');
    const rule = (name: string) => {
      const start = css.indexOf(`.${name} {`);
      const next = css.indexOf('\n}\n', start);
      return css.slice(start, next);
    };

    it('starts with the @reference to the app styles', () => {
      expect(css.split('\n')[0]).toBe('@reference "../../../../../styles/app.css";');
    });

    it('is hidden on phones and a sticky ink card from md', () => {
      const block = rule('summary');
      const md = block.indexOf('@variant md');
      expect(md).toBeGreaterThan(-1);
      expect(block.slice(0, md)).toContain('hidden');
      expect(block.slice(md)).toContain('sticky top-[120px] block');
      expect(block.slice(md)).toContain('border-[2.5px] border-ink bg-card');
      expect(block.slice(md)).toContain('var(--shadow-off)');
    });

    it('uses tabular figures for amounts, no hex and no print effect', () => {
      expect(css).toContain(
        '.row,\n.fee {\n  @apply flex justify-between gap-3 border-b border-hair py-2.5 text-[15px] tabular-nums;',
      );
      expect(rule('total')).toContain('tabular-nums');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css).not.toMatch(/rotate|halftone|transition|animation/);
    });
  });
});
