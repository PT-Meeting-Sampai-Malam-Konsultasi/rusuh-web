import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import en from '@translation/locale/en.json';
import id from '@translation/locale/id.json';

import { payView, summaryView } from '../../../__tests__/fixtures';
import PaymentSummary from '../index';

describe('PaymentSummary', () => {
  it('is a complementary landmark named by its h2, with event, ticket lines, fee, total, button and legal', () => {
    render(<PaymentSummary summary={summaryView()} pay={payView()} notice={null} />);
    const aside = screen.getByRole('complementary', { name: 'payment_summary_heading RSH-26-084731' });
    expect(within(aside).getByRole('heading', { level: 2 })).toHaveTextContent('RSH-26-084731');
    expect(within(aside).getByText('SAMUDRA · Sab, 12 Des 2026 · GBK')).toBeInTheDocument();
    const items = within(aside).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Festival B');
    expect(items[0]).toHaveTextContent('NIK 3174 •••• •••• 0004');
    expect(items[0]).toHaveTextContent('Rp 850.000');
    expect(items[2]).toHaveTextContent('Tribun Atas');
    expect(items[2]).toHaveTextContent('Rp 450.000');
    expect(within(aside).getByText('order_summary_fee').parentElement).toHaveTextContent('Rp 10.000');
    expect(within(aside).getByText('order_summary_total').parentElement).toHaveTextContent('Rp 2.160.000');
    const button = within(aside).getByRole('button', { name: 'payment_pay_label' });
    expect(within(button).getByText('→')).toHaveAttribute('aria-hidden', 'true');
    expect(button).not.toHaveAttribute('aria-describedby');
    const legal = within(aside).getByText('payment_legal');
    expect(button.compareDocumentPosition(legal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('has no button when pay is null, and no event line when it is empty', () => {
    render(<PaymentSummary summary={{ ...summaryView(), eventLine: '' }} pay={null} notice={null} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/SAMUDRA/)).toBeNull();
    expect(screen.getByText('payment_legal')).toBeInTheDocument();
  });

  it('calls onPay once on a click when enabled', async () => {
    const pay = payView();
    render(<PaymentSummary summary={summaryView()} pay={pay} notice={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'payment_pay_label' }));
    expect(pay.onPay).toHaveBeenCalledTimes(1);
  });

  it('is disabled, aria-busy and reads the busy label while Snap opens', async () => {
    const pay = payView({ busy: true, enabled: false });
    render(<PaymentSummary summary={summaryView()} pay={pay} notice={null} />);
    const button = screen.getByRole('button', { name: 'payment_pay_busy' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button', { name: 'payment_pay_label' })).toBeNull();
    await userEvent.click(button);
    expect(pay.onPay).not.toHaveBeenCalled();
  });

  it('shows an error notice as an alert that describes the button', () => {
    render(
      <PaymentSummary
        summary={summaryView()}
        pay={payView({ label: 'payment_pay_again' })}
        notice={{ text: 'payment_failed', tone: 'error' }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('payment_failed');
    expect(screen.getByRole('button', { name: 'payment_pay_again' })).toHaveAccessibleDescription('payment_failed');
  });

  it('shows an info notice as plain text', () => {
    render(<PaymentSummary summary={summaryView()} pay={payView()} notice={{ text: 'info', tone: 'info' }} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'payment_pay_label' })).toHaveAccessibleDescription('info');
  });

  it.each([
    { locale: 'id', strings: id, heading: 'Pesanan RSH-26-084731', button: 'Bayar' },
    { locale: 'en', strings: en, heading: 'Order RSH-26-084731', button: 'Pay' },
  ])('reads the real $locale copy', ({ strings, heading, button }) => {
    render(
      <PaymentSummary
        summary={{ ...summaryView(), heading: strings.payment_summary_heading, legal: strings.payment_legal }}
        pay={payView({ label: strings.payment_pay_label })}
        notice={null}
      />,
    );
    expect(screen.getByRole('complementary', { name: heading })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: button })).toBeInTheDocument();
    expect(screen.getByText(strings.payment_legal)).toBeInTheDocument();
  });

  describe('styles', () => {
    const css = readFileSync(join(__dirname, '..', 'payment-summary.module.css'), 'utf8');
    const rule = (name: string) => {
      const start = css.indexOf(`.${name} {`);
      return css.slice(start, css.indexOf('\n}\n', start));
    };

    it('starts with the @reference to the app styles', () => {
      expect(css.split('\n')[0]).toBe('@reference "../../../../../styles/app.css";');
    });

    it('is a flat ink card on phones and sticky from md', () => {
      const block = rule('summary');
      const md = block.indexOf('@variant md');
      expect(md).toBeGreaterThan(-1);
      expect(block.slice(0, md)).toContain('border-[2.5px] border-ink bg-card');
      expect(block.slice(0, md)).not.toContain('hidden');
      expect(block.slice(md)).toContain('sticky top-[120px]');
    });

    it('hides the notice and button on phones, where the dock carries them', () => {
      const block = rule('action');
      const md = block.indexOf('@variant md');
      expect(block.slice(0, md)).toContain('hidden');
      expect(block.slice(md)).toContain('block');
    });

    it('uses tabular figures, no hex and no print effect (trust zone)', () => {
      expect(rule('orderCode')).toContain('tabular-nums');
      expect(rule('nik')).toContain('tabular-nums');
      expect(rule('total')).toContain('tabular-nums');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css).not.toMatch(/rotate|halftone|transition|animation/);
    });
  });
});
