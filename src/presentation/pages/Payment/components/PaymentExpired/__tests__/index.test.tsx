import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PaymentExpiredView } from '@controllers/payment.controller';
import en from '@translation/locale/en.json';
import id from '@translation/locale/id.json';

import PaymentExpired from '../index';

const keys = (over: Partial<PaymentExpiredView> = {}): PaymentExpiredView => ({
  stamp: 'payment_expired_stamp',
  title: 'payment_expired_title',
  body: 'payment_expired_body',
  noteLead: 'payment_expired_note_lead',
  note: 'payment_expired_note_email',
  queueAgainLabel: 'payment_expired_queue_again',
  onQueueAgain: vi.fn(),
  homeHref: '/',
  homeLabel: 'action_back_home',
  ...over,
});

describe('PaymentExpired', () => {
  it('is a region named by its h1 with the stamp, title, body, note and actions in order', () => {
    render(<PaymentExpired expired={keys()} />);
    const section = screen.getByRole('region', { name: 'payment_expired_title' });
    const stamp = within(section).getByText('payment_expired_stamp');
    const title = within(section).getByRole('heading', { level: 1, name: 'payment_expired_title' });
    const body = within(section).getByText('payment_expired_body');
    const lead = within(section).getByText('payment_expired_note_lead');
    const button = within(section).getByRole('button');
    const ordered = [stamp, title, body, lead, button];
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i - 1].compareDocumentPosition(ordered[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(lead.tagName).toBe('B');
    expect(lead.parentElement).toHaveTextContent('payment_expired_note_lead payment_expired_note_email');
  });

  it('moves focus to the title on mount', () => {
    render(<PaymentExpired expired={keys()} />);
    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveAttribute('tabindex', '-1');
    expect(title).toHaveFocus();
  });

  it('renders the note alone when there is no lead', () => {
    const { container } = render(
      <PaymentExpired expired={keys({ noteLead: null, note: 'payment_inactive_refund' })} />,
    );
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('payment_inactive_refund').textContent).toBe('payment_inactive_refund');
  });

  it('names the button without the hidden arrow and calls onQueueAgain once', async () => {
    const expired = keys();
    render(<PaymentExpired expired={expired} />);
    const button = screen.getByRole('button', { name: 'payment_expired_queue_again' });
    expect(within(button).getByText('→')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(button);
    expect(expired.onQueueAgain).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'action_back_home' })).toHaveAttribute('href', '/');
  });

  it('hides the button without an event, keeping the home link', () => {
    render(<PaymentExpired expired={keys({ onQueueAgain: null })} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'action_back_home' })).toHaveAttribute('href', '/');
  });

  it.each([
    { locale: 'id', strings: id, title: 'Pesanan dibatalkan.', button: 'Antre lagi', home: 'Ke beranda' },
    { locale: 'en', strings: en, title: 'Order cancelled.', button: 'Queue again', home: 'Go home' },
  ])('reads the real $locale copy', ({ strings, title, button, home }) => {
    render(
      <PaymentExpired
        expired={{
          stamp: strings.payment_expired_stamp,
          title: strings.payment_expired_title,
          body: strings.payment_expired_body_unknown,
          noteLead: strings.payment_expired_note_lead,
          note: strings.payment_expired_note_account,
          queueAgainLabel: strings.payment_expired_queue_again,
          onQueueAgain: vi.fn(),
          homeHref: '/',
          homeLabel: strings.action_back_home,
        }}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: title })).toHaveFocus();
    expect(screen.getByRole('button', { name: button })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: home })).toBeInTheDocument();
  });

  describe('styles', () => {
    const css = readFileSync(join(__dirname, '..', 'payment-expired.module.css'), 'utf8');
    const rule = (name: string) => {
      const start = css.indexOf(`.${name} {`);
      const next = css.indexOf('\n}\n', start);
      return css.slice(start, next);
    };
    const split = (block: string) => {
      const md = block.indexOf('@variant md');
      return md === -1 ? { base: block, md: '' } : { base: block.slice(0, md), md: block.slice(md) };
    };

    it('starts with the @reference to the app styles', () => {
      expect(css.split('\n')[0]).toBe('@reference "../../../../../styles/app.css";');
    });

    it('ports the HiFi display XL title: 58px on phones, clamp from md, .84, stretch 75%', () => {
      const title = split(rule('title'));
      expect(title.base).toContain('text-[58px]');
      expect(title.base).toContain('leading-[0.84]');
      expect(title.base).toContain('font-stretch: 75%');
      expect(title.base).toContain('letter-spacing: -0.02em');
      expect(title.base).toContain('mt-1.5');
      expect(title.md).toContain('clamp(64px, 9vw, 128px)');
    });

    it('lays out the column and the actions as the HiFi', () => {
      expect(rule('expired')).toContain('max-w-[640px] flex-col items-start gap-[18px]');
      expect(rule('actions')).toContain('mt-2.5 flex flex-wrap items-center gap-6');
      expect(rule('note')).toContain('border-[2.5px] border-ink bg-card px-[18px] py-4');
    });

    it('gives the link a 44px target and a focus style; no hex', () => {
      const link = rule('link');
      expect(link).toContain('min-h-11');
      expect(link).toContain(':focus-visible');
      expect(link).toContain(':hover');
      expect(link).toContain(':active');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });
  });
});
