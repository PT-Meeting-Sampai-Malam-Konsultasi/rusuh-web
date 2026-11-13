import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaymentControllerInterface } from '@controllers/payment.controller';

import PaymentScreen from '../index';
import { introView, messageView, payView, progressView, summaryView, timerView } from './fixtures';

let controller: PaymentControllerInterface;

vi.mock('@infrastructure/di/container', () => ({ default: { resolve: () => controller } }));
vi.mock('@infrastructure/di/controllers/payment', () => ({}));

const base = (): PaymentControllerInterface => ({
  t: ((k: string) => k) as never,
  state: 'ready',
  steps: [
    { number: 1, label: 'order_step_choose', current: false, done: true },
    { number: 2, label: 'order_step_pay', current: true, done: false },
    { number: 3, label: 'order_step_ticket', current: false, done: false },
  ],
  title: 'payment_title',
  intro: introView(),
  summary: summaryView(),
  pay: payView(),
  notice: null,
  progress: null,
  message: null,
  homeHref: '/',
  backHref: '/',
  locale: 'id',
  setLocale: vi.fn(),
  timer: null,
  timeUp: false,
});

const failedNotice = { text: 'payment_failed', tone: 'error' as const };

/** Spec 78's page-state table: what the controller hands over per state. */
const states: { name: string; view: () => Partial<PaymentControllerInterface> }[] = [
  {
    name: 'loading',
    view: () => ({ state: 'loading', intro: null, summary: null, pay: null }),
  },
  { name: 'ready', view: () => ({ timer: timerView() }) },
  {
    name: 'opening',
    view: () => ({ state: 'opening', pay: payView({ busy: true, enabled: false }), timer: timerView() }),
  },
  {
    name: 'verifying, confirming',
    view: () => ({ state: 'verifying', intro: null, pay: null, progress: progressView(), timer: timerView() }),
  },
  {
    name: 'verifying, waiting',
    view: () => ({
      state: 'verifying',
      timer: timerView(),
      intro: null,
      pay: payView({ label: 'payment_pay_reopen', dockLabel: 'payment_pay_reopen' }),
      progress: progressView({ reason: 'waiting', title: 'payment_waiting_title', body: 'payment_waiting_body' }),
    }),
  },
  {
    name: 'failed',
    view: () => ({
      state: 'failed',
      timer: timerView(),
      notice: failedNotice,
      pay: payView({ label: 'payment_pay_again', dockLabel: 'payment_pay_again' }),
    }),
  },
  {
    name: 'busy',
    view: () => ({
      state: 'busy',
      timer: timerView(),
      notice: { text: 'error_payment_provider_busy', tone: 'error' },
      pay: payView({ label: 'action_retry', dockLabel: 'action_retry' }),
    }),
  },
  {
    name: 'leaving',
    view: () => ({
      state: 'leaving',
      intro: null,
      pay: null,
      progress: progressView({ reason: 'paid', title: 'payment_paid_title', body: 'payment_paid_body', held: '' }),
    }),
  },
  {
    name: 'inactive',
    view: () => ({ state: 'inactive', intro: null, summary: null, pay: null, message: messageView() }),
  },
  {
    name: 'inactive with refund',
    view: () => ({
      state: 'inactive',
      intro: null,
      summary: null,
      pay: null,
      message: messageView({ note: 'payment_inactive_refund' }),
    }),
  },
  {
    name: 'not-found',
    view: () => ({
      state: 'not-found',
      intro: null,
      summary: null,
      pay: null,
      message: messageView({ title: 'payment_not_found_title', body: 'payment_not_found_body' }),
    }),
  },
  {
    name: 'error',
    view: () => ({
      state: 'error',
      intro: null,
      summary: null,
      pay: null,
      message: messageView({
        title: 'payment_error_title',
        body: 'error_network_error',
        actionLabel: 'action_retry',
        onAction: vi.fn(),
      }),
    }),
  },
];

describe('PaymentScreen', () => {
  beforeEach(() => {
    controller = base();
  });

  it('renders the flow header with a done step 1, the current step 2 and the title', () => {
    render(<PaymentScreen />);
    const items = within(screen.getByRole('list', { name: 'order_steps_label' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('order_step_choose (payment_step_done)');
    expect(within(items[0]).getByText('✓')).toHaveAttribute('aria-hidden', 'true');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('payment_title', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'payment_back_label' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('switches the language through the controller', async () => {
    render(<PaymentScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(controller.setLocale).toHaveBeenCalledWith('en');
  });

  it.each(states)('renders exactly the sections of the "$name" state', ({ view }) => {
    controller = { ...base(), ...view() };
    render(<PaymentScreen />);
    const main = screen.getByRole('main');
    const c = controller;

    expect(main).toHaveAttribute('aria-busy', String(c.state === 'loading'));
    if (c.state === 'loading') expect(within(main).getByRole('status')).toHaveTextContent('state_loading');

    // Panel column
    if (c.intro) expect(within(main).getByRole('heading', { level: 1, name: c.intro.heading })).toBeInTheDocument();
    else expect(screen.queryByText('payment_intro')).toBeNull();
    if (c.progress) {
      const status = within(main).getByRole('status');
      expect(within(status).getByRole('heading', { level: 1, name: c.progress.title })).toBeInTheDocument();
    }
    if (c.message) {
      expect(within(main).getByRole('heading', { level: 1, name: c.message.title })).toBeInTheDocument();
      expect(within(main).getByRole('link', { name: 'action_back_home' })).toBeInTheDocument();
      if (c.message.note) expect(within(main).getByText(c.message.note)).toBeInTheDocument();
      if (c.message.actionLabel) {
        expect(within(main).getByRole('button', { name: c.message.actionLabel })).toBeInTheDocument();
      }
    }
    expect(within(main).queryAllByRole('heading', { level: 1 })).toHaveLength(c.state === 'loading' ? 0 : 1);

    // Aside inside main, after the panel column
    const aside = screen.queryByRole('complementary');
    if (c.summary) {
      expect(aside).not.toBeNull();
      expect(main).toContainElement(aside);
      expect(main.lastElementChild).toBe(aside);
      if (c.pay) {
        const name = c.pay.busy ? c.pay.busyLabel : c.pay.label;
        expect(within(aside!).getByRole('button', { name })).toBeInTheDocument();
      } else {
        expect(within(aside!).queryByRole('button')).toBeNull();
      }
    } else {
      expect(aside).toBeNull();
    }

    // Dock outside main
    const dock = screen.queryByRole('region', { name: 'payment_dock_label' });
    if (c.summary && c.pay) {
      expect(dock).not.toBeNull();
      expect(main).not.toContainElement(dock);
      const name = c.pay.busy ? c.pay.busyLabel : c.pay.dockLabel;
      expect(within(dock!).getByRole('button', { name })).toBeInTheDocument();
    } else {
      expect(dock).toBeNull();
    }

    // Notice in aside and dock, as alerts
    if (c.notice) expect(screen.getAllByRole('alert')).toHaveLength(2);

    // Timer: flow bar and app bar (jsdom applies no CSS), only in the timer states
    expect(screen.queryAllByRole('timer')).toHaveLength(c.timer ? 2 : 0);
  });

  it('shows the payment countdown in both bars of the header, compact, with its label (FR-21-W1)', () => {
    controller = { ...base(), timer: timerView() };
    render(<PaymentScreen />);
    const timers = screen.getAllByRole('timer');
    expect(timers).toHaveLength(2);
    expect(within(screen.getByRole('banner')).getAllByRole('timer')).toEqual(timers);
    for (const timer of timers) {
      expect(timer).toHaveTextContent('9:12');
      expect(within(timer).getByText('payment_timer_label')).toBeInTheDocument();
      expect(timer).toHaveAttribute('data-compact');
      expect(timer).toHaveAttribute('aria-live', 'off');
    }
  });

  it.each([
    { seconds: 121, live: 'off', text: '2:01' },
    { seconds: 120, live: 'polite', text: '2:00' },
  ])('puts both timers in the warning state from 120 seconds: $seconds s is $live', ({ seconds, live, text }) => {
    controller = { ...base(), timer: timerView({ seconds }) };
    render(<PaymentScreen />);
    const timers = screen.getAllByRole('timer');
    expect(timers).toHaveLength(2);
    for (const timer of timers) {
      expect(timer).toHaveAttribute('aria-live', live);
      expect(timer).toHaveTextContent(text);
    }
  });

  it('at zero: both timers read 0:00 in the warning state and both pay buttons are off', () => {
    controller = { ...base(), timer: timerView({ seconds: 0 }), timeUp: true, pay: payView({ enabled: false }) };
    render(<PaymentScreen />);
    const timers = screen.getAllByRole('timer');
    expect(timers).toHaveLength(2);
    for (const timer of timers) {
      expect(timer).toHaveTextContent('0:00');
      expect(timer).toHaveAttribute('aria-live', 'polite');
    }
    expect(screen.getByRole('button', { name: 'payment_pay_label' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'payment_pay_amount' })).toBeDisabled();
    expect(screen.getByRole('heading', { level: 1, name: 'payment_heading' })).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('pays from the aside and the dock through pay.onPay', async () => {
    render(<PaymentScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'payment_pay_label' }));
    await userEvent.click(screen.getByRole('button', { name: 'payment_pay_amount' }));
    expect(controller.pay?.onPay).toHaveBeenCalledTimes(2);
  });

  it('busy: both buttons are disabled, aria-busy and read the busy label', () => {
    controller = { ...base(), state: 'opening', pay: payView({ busy: true, enabled: false }) };
    render(<PaymentScreen />);
    const buttons = screen.getAllByRole('button', { name: 'payment_pay_busy' });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
    }
  });

  it('uses the flow grid of the order page in its CSS module', () => {
    const css = readFileSync(join(__dirname, '..', 'payment.module.css'), 'utf8');
    expect(css.split('\n')[0]).toBe('@reference "../../../styles/app.css";');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 340px;');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) 400px;');
  });
});
