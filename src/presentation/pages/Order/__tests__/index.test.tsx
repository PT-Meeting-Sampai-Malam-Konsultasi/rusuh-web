import { render, screen } from '@testing-library/react';
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
  showHolderChoice: false,
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
});

const holder: OrderControllerInterface['holders'][number] = {
  key: 'cat_fa-1',
  title: 'Tiket 1 · Festival A',
  holderType: 'self',
  choiceName: 'order-holder-1-type',
  selfDisabled: false,
  choose: vi.fn(),
  name: {
    id: 'order-holder-1-name',
    value: 'Nadia Saputri',
    readOnly: true,
    hint: 'Dari profil Anda.',
    onChange: vi.fn(),
  },
  nik: { id: 'order-holder-1-nik', value: '', onChange: vi.fn(), onFocus: vi.fn(), onBlur: vi.fn() },
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

  it('shows the holders section with the choice when ready and showHolders', () => {
    controller = { ...base(), totalTickets: 1, showHolders: true, showHolderChoice: true, holders: [holder] };
    render(<OrderScreen />);
    const section = screen.getByRole('region', { name: 'order_holders_heading' });
    expect(section).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Tiket 1 · Festival A' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'order_holder_for_label' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'order_holder_name_label' })).toHaveValue('Nadia Saputri');
  });

  it('passes showHolderChoice through: no radios without it', () => {
    controller = { ...base(), totalTickets: 1, showHolders: true, showHolderChoice: false, holders: [holder] };
    render(<OrderScreen />);
    expect(screen.getByRole('region', { name: 'order_holders_heading' })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
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
});
