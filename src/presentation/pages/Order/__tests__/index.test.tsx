import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrderControllerInterface } from '@controllers/order.controller';

import OrderScreen from '../index';

let controller: OrderControllerInterface;

vi.mock('@infrastructure/di/container', () => ({ default: { resolve: () => controller } }));
vi.mock('@infrastructure/di/controllers/order', () => ({}));

const base = (): OrderControllerInterface => ({
  t: ((k: string) => k) as never,
  status: 'ready',
  event: {
    id: 'evt_samudra',
    name: 'Samudra',
    subtitle: 'Tur Gelombang 2026',
    posterTone: 'blue',
    metaLine: 'Sab, 12 Des 2026 · 19.00 WIB · Stadion Utama GBK, Jakarta',
  },
  categories: [
    {
      id: 'cat_fa',
      name: 'Festival A',
      description: 'Berdiri · paling dekat panggung',
      price: 'Rp 1.250.000',
      availability: 'available',
      availabilityLabel: 'Tersedia',
      soldOut: false,
      quantity: 0,
      selected: false,
      canIncrement: true,
      canDecrement: false,
      incrementLabel: 'Tambah Festival A',
      decrementLabel: 'Kurangi Festival A',
    },
    {
      id: 'cat_tb',
      name: 'Tribun Bawah',
      price: 'Rp 850.000',
      availability: 'sold_out',
      availabilityLabel: 'Habis',
      soldOut: true,
      quantity: 0,
      selected: false,
      canIncrement: false,
      canDecrement: false,
      incrementLabel: 'Tambah Tribun Bawah',
      decrementLabel: 'Kurangi Tribun Bawah',
    },
  ],
  increment: vi.fn(),
  decrement: vi.fn(),
  totalTickets: 0,
  orderLimit: 3,
  showHolders: false,
  holders: [],
  limitNotice: null,
  categoryNote: 'Maks. 3 tiket per transaksi.',
  errorMessage: '',
  retry: vi.fn(),
  steps: [
    { number: 1, label: 'order_step_choose', current: true },
    { number: 2, label: 'order_step_pay', current: false },
    { number: 3, label: 'order_step_ticket', current: false },
  ],
  backHref: '/queue?event=evt_samudra',
  homeHref: '/',
  locale: 'id',
  setLocale: vi.fn(),
  allHoldersVerified: false,
  timer: null,
  timeUp: false,
  timeUpSheet: null,
  summary: null,
  checkout: null,
});

const holder: OrderControllerInterface['holders'][number] = {
  key: 'cat_fa-1',
  title: 'Tiket 1 · Festival A',
  name: {
    id: 'order-holder-1-name',
    value: 'Nadia Saputri',
    hint: 'Dicetak di e-tiket.',
    onChange: vi.fn(),
    onBlur: vi.fn(),
  },
  nik: {
    id: 'order-holder-1-nik',
    value: '',
    onChange: vi.fn(),
    onFocus: vi.fn(),
    onBlur: vi.fn(),
    checking: false,
    canRecheck: false,
    recheck: vi.fn(),
  },
};

/** The limit region: the one atomic status (each stepper `output` is an implicit status too). */
const limitRegion = () => {
  const regions = screen.getAllByRole('status').filter((el) => el.getAttribute('aria-atomic') === 'true');
  expect(regions).toHaveLength(1);
  return regions[0];
};

describe('OrderScreen', () => {
  beforeEach(() => {
    controller = base();
  });

  it('renders the flow header, event header and categories when ready', () => {
    render(<OrderScreen />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'order_steps_label' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'order_back_label' })).toHaveAttribute('href', '/queue?event=evt_samudra');
    expect(screen.getByText('order_title')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Samudra Tur Gelombang 2026');
    expect(screen.getByRole('heading', { level: 2, name: 'order_category_heading' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Festival A',
      'Tribun Bawah',
    ]);
    expect(screen.getByText('Rp 1.250.000')).toBeInTheDocument();
    expect(screen.getByText('Habis')).toBeInTheDocument();
    expect(screen.getByText('Maks. 3 tiket per transaksi.')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('wires the stepper to increment / decrement', async () => {
    controller = {
      ...base(),
      categories: base().categories.map((c, i) =>
        i === 0 ? { ...c, quantity: 1, selected: true, canDecrement: true } : c,
      ),
    };
    render(<OrderScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'Tambah Festival A' }));
    expect(controller.increment).toHaveBeenCalledWith('cat_fa');
    await userEvent.click(screen.getByRole('button', { name: 'Kurangi Festival A' }));
    expect(controller.decrement).toHaveBeenCalledWith('cat_fa');
  });

  it('passes the limit notice to the category list', () => {
    controller = { ...base(), limitNotice: { count: '3/3', message: 'order_limit_reached' } };
    render(<OrderScreen />);
    const region = limitRegion();
    expect(region).toHaveTextContent('3/3 order_limit_reached');
    expect(region.querySelector('b')).toHaveTextContent('3/3');
  });

  it('keeps the limit region empty without a notice', () => {
    render(<OrderScreen />);
    expect(limitRegion()).toBeEmptyDOMElement();
  });

  it('shows the sold-out row with both stepper buttons disabled', () => {
    render(<OrderScreen />);
    expect(screen.getByRole('button', { name: 'Tambah Tribun Bawah' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Kurangi Tribun Bawah' })).toBeDisabled();
  });

  it('hides the holders section until a ticket is picked', () => {
    render(<OrderScreen />);
    expect(screen.queryByRole('region', { name: 'order_holders_heading' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows the holders section when ready and showHolders, without a "Saya sendiri" choice', () => {
    controller = { ...base(), totalTickets: 1, showHolders: true, holders: [holder] };
    render(<OrderScreen />);
    const section = screen.getByRole('region', { name: 'order_holders_heading' });
    expect(section).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Tiket 1 · Festival A' })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'order_holder_name_label' })).toHaveValue('Nadia Saputri');
  });

  it('never shows the holders section outside the ready state', () => {
    controller = { ...base(), status: 'loading', event: null, showHolders: true, holders: [holder] };
    render(<OrderScreen />);
    expect(screen.queryByRole('region', { name: 'order_holders_heading' })).toBeNull();
  });

  it('passes the language switch through', async () => {
    render(<OrderScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(controller.setLocale).toHaveBeenCalledWith('en');
  });

  it('shows the skeleton while loading, keeping the header', () => {
    controller = { ...base(), status: 'loading', event: null, categories: [], categoryNote: '' };
    render(<OrderScreen />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('state_loading');
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('shows the error with retry and a way home', async () => {
    controller = { ...base(), status: 'error', event: null, categories: [], errorMessage: 'error_network_error' };
    render(<OrderScreen />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('order_error_title');
    expect(screen.getByRole('alert')).toHaveTextContent('error_network_error');
    await userEvent.click(screen.getByRole('button', { name: 'action_retry' }));
    expect(controller.retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'action_back_home' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('region', { name: 'order_category_heading' })).toBeNull();
  });

  it('shows not-found without retry', () => {
    controller = { ...base(), status: 'not-found', event: null, categories: [] };
    render(<OrderScreen />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('order_not_found_title');
    expect(screen.getByText('order_not_found_body')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'action_retry' })).toBeNull();
    expect(screen.getByRole('link', { name: 'action_back_home' })).toBeInTheDocument();
  });

  it('shows the countdown in both bars of the flow header, compact (FR-17-W1)', () => {
    controller = { ...base(), timer: { seconds: 252, label: 'order_timer_label' } };
    render(<OrderScreen />);
    const timers = screen.getAllByRole('timer');
    // jsdom applies no CSS: the flow bar and the app bar instances are both there.
    expect(timers).toHaveLength(2);
    expect(within(screen.getByRole('banner')).getAllByRole('timer')).toEqual(timers);
    for (const timer of timers) {
      expect(timer).toHaveTextContent('4:12');
      expect(within(timer).getByText('order_timer_label')).toBeInTheDocument();
      expect(timer).toHaveAttribute('data-compact');
      expect(timer).toHaveAttribute('aria-live', 'off');
    }
  });

  it.each([
    { seconds: 61, live: 'off', text: '1:01' },
    { seconds: 60, live: 'polite', text: '1:00' },
    { seconds: 0, live: 'polite', text: '0:00' },
  ])('puts both timers in the warning state from 60 seconds: $seconds s is $live', ({ seconds, live, text }) => {
    controller = { ...base(), timer: { seconds, label: 'order_timer_label' } };
    render(<OrderScreen />);
    const timers = screen.getAllByRole('timer');
    expect(timers).toHaveLength(2);
    for (const timer of timers) {
      expect(timer).toHaveAttribute('aria-live', live);
      expect(timer).toHaveTextContent(text);
    }
  });

  it.each([
    { status: 'loading' as const, extra: { categories: [], categoryNote: '' } },
    { status: 'error' as const, extra: { categories: [], errorMessage: 'error_network_error' } },
    { status: 'not-found' as const, extra: { categories: [] } },
  ])('renders no timer when the controller gives none: $status', ({ status, extra }) => {
    controller = { ...base(), status, event: null, ...extra, timer: null };
    render(<OrderScreen />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('renders no dialog while the controller gives no time-up sheet', () => {
    controller = { ...base(), timer: { seconds: 0, label: 'order_timer_label' }, timeUp: true, timeUpSheet: null };
    render(<OrderScreen />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it("shows the time's-up sheet over the page, timers at 0:00 underneath (FR-18-W1)", async () => {
    const queueAgain = vi.fn();
    controller = {
      ...base(),
      timer: { seconds: 0, label: 'order_timer_label' },
      timeUp: true,
      timeUpSheet: {
        stamp: 'order_time_up_stamp',
        title: 'order_time_up_title',
        body: 'order_time_up_body',
        queueAgainLabel: 'order_time_up_queue_again',
        homeLabel: 'action_back_home',
        homeHref: '/',
        queueAgain,
      },
    };
    render(<OrderScreen />);
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toHaveAccessibleName('order_time_up_title');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'order_category_heading' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tambah Festival A' })).toBeInTheDocument();
    const timers = screen.getAllByRole('timer');
    expect(timers).toHaveLength(2);
    for (const timer of timers) expect(timer).toHaveTextContent('0:00');
    await userEvent.click(within(dialogs[0]).getByRole('button', { name: 'order_time_up_queue_again' }));
    expect(queueAgain).toHaveBeenCalledTimes(1);
  });

  describe('summary and continue (FR-16-W1)', () => {
    const withCheckout = (over: Partial<NonNullable<OrderControllerInterface['checkout']>> = {}) => ({
      ...base(),
      totalTickets: 1,
      showHolders: true,
      holders: [holder],
      summary: {
        heading: 'order_summary_heading',
        lines: [{ key: 'cat_fa', label: '1 × Festival A', amount: 'Rp 1.250.000' }],
        feeLabel: 'order_summary_fee',
        fee: 'Rp 10.000',
        totalLabel: 'order_summary_total',
        total: 'Rp 1.260.000',
        note: 'order_summary_note',
        ticketCount: '1 tiket',
        dockLabel: 'order_summary_dock_label',
      },
      checkout: {
        label: 'order_checkout_label',
        shortLabel: 'order_checkout_short_label',
        enabled: true,
        busy: false,
        hint: null,
        onContinue: vi.fn(),
        ...over,
      },
    });

    it('renders neither the aside nor the dock without summary and checkout', () => {
      render(<OrderScreen />);
      expect(screen.queryByRole('complementary')).toBeNull();
      expect(screen.queryByRole('region', { name: 'order_summary_dock_label' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'order_checkout_label' })).toBeNull();
    });

    it('places the aside in main after the flow column and the dock after main', () => {
      controller = withCheckout();
      render(<OrderScreen />);
      const main = screen.getByRole('main');
      const aside = screen.getByRole('complementary', { name: 'order_summary_heading' });
      expect(main.children).toHaveLength(2);
      expect(main.children[1]).toBe(aside);
      const dock = screen.getByRole('region', { name: 'order_summary_dock_label' });
      expect(main).not.toContainElement(dock);
      expect(main.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(aside).getByText('Rp 1.260.000')).toBeInTheDocument();
      expect(within(dock).getByText('1 tiket')).toBeInTheDocument();
    });

    it('wires both buttons to onContinue', async () => {
      controller = withCheckout();
      render(<OrderScreen />);
      await userEvent.click(screen.getByRole('button', { name: 'order_checkout_label' }));
      await userEvent.click(screen.getByRole('button', { name: 'order_checkout_short_label' }));
      expect(controller.checkout?.onContinue).toHaveBeenCalledTimes(2);
    });

    it('passes the disabled state and the hint to both sections', () => {
      controller = withCheckout({ enabled: false, hint: { text: 'order_hold_sold_out', error: true } });
      render(<OrderScreen />);
      expect(screen.getByRole('button', { name: 'order_checkout_label' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'order_checkout_short_label' })).toBeDisabled();
      expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
        'order_hold_sold_out',
        'order_hold_sold_out',
      ]);
    });

    it("keeps the time's-up sheet last, after the dock", () => {
      controller = {
        ...withCheckout(),
        timeUpSheet: {
          stamp: 'order_time_up_stamp',
          title: 'order_time_up_title',
          body: 'order_time_up_body',
          queueAgainLabel: 'order_time_up_queue_again',
          homeLabel: 'action_back_home',
          homeHref: '/',
          queueAgain: vi.fn(),
        },
      };
      render(<OrderScreen />);
      const dock = screen.getByRole('region', { name: 'order_summary_dock_label' });
      const dialog = screen.getByRole('dialog');
      expect(dock.compareDocumentPosition(dialog) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe("time's-up sheet after a reload (FR-19-W1)", () => {
    const sheet = (): NonNullable<OrderControllerInterface['timeUpSheet']> => ({
      stamp: 'order_time_up_stamp',
      title: 'order_time_up_title',
      body: 'order_time_up_body',
      queueAgainLabel: 'order_time_up_queue_again',
      homeLabel: 'action_back_home',
      homeHref: '/',
      queueAgain: vi.fn(),
    });

    it('shows the sheet over the loading state: skeleton under it, no timer', () => {
      controller = {
        ...base(),
        status: 'loading',
        event: null,
        categories: [],
        categoryNote: '',
        timer: null,
        timeUp: true,
        timeUpSheet: sheet(),
      };
      render(<OrderScreen />);
      const dialogs = screen.getAllByRole('dialog');
      expect(dialogs).toHaveLength(1);
      expect(dialogs[0]).toHaveAccessibleName('order_time_up_title');
      expect(screen.getByRole('status')).toHaveTextContent('state_loading');
      expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
      expect(screen.queryByRole('timer')).toBeNull();
    });

    it('shows the sheet over the error message', () => {
      controller = {
        ...base(),
        status: 'error',
        event: null,
        categories: [],
        errorMessage: 'error_network_error',
        timer: null,
        timeUp: true,
        timeUpSheet: sheet(),
      };
      render(<OrderScreen />);
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1, name: 'order_error_title' })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('error_network_error');
      expect(screen.queryByRole('timer')).toBeNull();
    });
  });
});
