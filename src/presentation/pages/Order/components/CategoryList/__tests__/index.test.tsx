import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { OrderCategoryRow } from '@controllers/order.controller';
import en from '@translation/locale/en.json';
import id from '@translation/locale/id.json';

import CategoryList from '../index';

type StepperFields = Pick<
  OrderCategoryRow,
  'quantity' | 'selected' | 'canIncrement' | 'canDecrement' | 'incrementLabel' | 'decrementLabel'
>;

const stepper = (name: string, quantity = 0): StepperFields => ({
  quantity,
  selected: quantity > 0,
  canIncrement: true,
  canDecrement: quantity > 0,
  incrementLabel: `Tambah ${name}`,
  decrementLabel: `Kurangi ${name}`,
});

const categories: OrderCategoryRow[] = [
  {
    id: 'cat_fa',
    name: 'Festival A',
    description: 'Berdiri · paling dekat panggung',
    price: 'Rp 1.250.000',
    availability: 'available',
    availabilityLabel: 'Tersedia',
    soldOut: false,
    ...stepper('Festival A'),
  },
  {
    id: 'cat_fb',
    name: 'Festival B',
    description: 'Berdiri · di belakang Festival A',
    price: 'Rp 1.100.000',
    availability: 'almost_gone',
    availabilityLabel: 'Hampir habis',
    soldOut: false,
    ...stepper('Festival B', 2),
  },
  {
    id: 'cat_tb',
    name: 'Tribun Bawah',
    price: 'Rp 850.000',
    availability: 'sold_out',
    availabilityLabel: 'Habis',
    soldOut: true,
    ...stepper('Tribun Bawah'),
    canIncrement: false,
  },
];

type Props = ComponentProps<typeof CategoryList>;

const renderList = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    heading: 'Kategori',
    note,
    categories,
    onIncrement: vi.fn(),
    onDecrement: vi.fn(),
    limitNotice: null,
    ...overrides,
  };
  const view = render(<CategoryList {...props} />);
  return { ...props, rerender: (next: Partial<Props>) => view.rerender(<CategoryList {...props} {...next} />) };
};

/** The limit region: the one atomic status (each stepper `output` is an implicit status too). */
const limitRegion = () => {
  const regions = screen.getAllByRole('status').filter((el) => el.getAttribute('aria-atomic') === 'true');
  expect(regions).toHaveLength(1);
  return regions[0];
};

const note = 'Maks. 3 tiket per transaksi. Tanpa nomor kursi — masuk sesuai kategori.';

describe('CategoryList', () => {
  it('is a section labelled by its heading, with the note describing the list', () => {
    renderList();
    expect(screen.getByRole('region', { name: 'Kategori' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Kategori' })).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveAccessibleDescription(note);
  });

  it('lists every category in order with its name as h3', () => {
    renderList();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Festival A',
      'Festival B',
      'Tribun Bawah',
    ]);
    expect(within(items[0]).getByText('Berdiri · paling dekat panggung')).toBeInTheDocument();
  });

  it('shows each row label and price after the name', () => {
    renderList();
    const items = screen.getAllByRole('listitem');
    const expected = [
      ['Festival A', 'Tersedia', 'Rp 1.250.000'],
      ['Festival B', 'Hampir habis', 'Rp 1.100.000'],
      ['Tribun Bawah', 'Habis', 'Rp 850.000'],
    ];
    expected.forEach(([name, label, price], index) => {
      const item = items[index];
      expect(within(item).getByText(label)).toHaveAttribute('data-availability', categories[index].availability);
      expect(within(item).getByText(price)).toBeInTheDocument();
      const text = item.textContent ?? '';
      expect(text.indexOf(name)).toBeLessThan(text.indexOf(label));
      expect(text.indexOf(label)).toBeLessThan(text.indexOf(price));
    });
  });

  it('marks only the sold-out row, announces "Habis" before the price and strikes through in CSS only', () => {
    renderList();
    const items = screen.getAllByRole('listitem');
    expect(items[0]).not.toHaveAttribute('data-sold-out');
    expect(items[1]).not.toHaveAttribute('data-sold-out');
    const out = items[2];
    expect(out).toHaveAttribute('data-sold-out');
    expect(within(out).getByText('Habis')).toBeInTheDocument();
    expect(out.textContent).toMatch(/Habis.*Rp 850\.000/);
    expect(screen.getByRole('list').querySelector('s, del, strike, [aria-hidden]')).toBeNull();
  });

  it('keeps the price on a row without description, with no empty paragraph', () => {
    renderList();
    const last = screen.getAllByRole('listitem')[2];
    expect(last.querySelector('p')).toBeNull();
    expect(within(last).getByText('Rp 850.000')).toBeInTheDocument();
  });

  it('shows no label for an unknown availability but still the price', () => {
    const unknown: OrderCategoryRow = {
      id: 'cat_vip',
      name: 'VIP',
      price: 'Rp 3.000.000',
      availability: null,
      availabilityLabel: '',
      soldOut: false,
      ...stepper('VIP'),
    };
    renderList({ categories: [unknown] });
    const item = screen.getByRole('listitem');
    expect(item.querySelector('[data-availability]')).toBeNull();
    expect(item).not.toHaveAttribute('data-sold-out');
    expect(item.textContent).toBe('VIPRp 3.000.000−0+');
  });

  it('renders the English strings it is given', () => {
    const en: OrderCategoryRow[] = [
      {
        ...categories[1],
        price: 'Rp 1,100,000',
        availabilityLabel: 'Almost gone',
        incrementLabel: 'Add Festival B',
        decrementLabel: 'Remove Festival B',
      },
      { ...categories[2], price: 'Rp 850,000', availabilityLabel: 'Sold out' },
    ];
    renderList({ heading: 'Categories', note: '', categories: en });
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('Almost gone')).toBeInTheDocument();
    expect(within(items[0]).getByText('Rp 1,100,000')).toBeInTheDocument();
    expect(within(items[0]).getByRole('button', { name: 'Add Festival B' })).toBeInTheDocument();
    expect(within(items[0]).getByRole('button', { name: 'Remove Festival B' })).toBeInTheDocument();
    expect(within(items[1]).getByText('Sold out')).toBeInTheDocument();
  });

  it('puts a labelled − / count / + stepper after the price in every row', () => {
    renderList();
    const items = screen.getAllByRole('listitem');
    const names = ['Festival A', 'Festival B', 'Tribun Bawah'];
    items.forEach((item, index) => {
      const minus = within(item).getByRole('button', { name: `Kurangi ${names[index]}` });
      const plus = within(item).getByRole('button', { name: `Tambah ${names[index]}` });
      expect(minus).toHaveAttribute('type', 'button');
      expect(plus).toHaveAttribute('type', 'button');
      const output = item.querySelector('output');
      expect(output).toHaveAttribute('aria-live', 'polite');
      expect(output).toHaveTextContent(String(categories[index].quantity));
      const text = item.textContent ?? '';
      expect(text.indexOf(categories[index].price)).toBeLessThan(text.indexOf('−'));
      expect(text.indexOf('−')).toBeLessThan(text.indexOf('+'));
    });
    expect(screen.getAllByRole('button')).toHaveLength(6);
    expect(screen.getByRole('list').querySelector('input')).toBeNull();
  });

  it('disables − and + from canDecrement / canIncrement', () => {
    renderList({
      categories: [categories[0], { ...categories[1], canIncrement: false }],
    });
    expect(screen.getByRole('button', { name: 'Kurangi Festival A' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tambah Festival A' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Kurangi Festival B' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Tambah Festival B' })).toBeDisabled();
  });

  it('disables both buttons on a sold-out row at 0, natively and without aria-disabled', async () => {
    const props = renderList();
    const minus = screen.getByRole('button', { name: 'Kurangi Tribun Bawah' });
    const plus = screen.getByRole('button', { name: 'Tambah Tribun Bawah' });
    expect(minus).toBeDisabled();
    expect(plus).toBeDisabled();
    expect(minus).not.toHaveAttribute('aria-disabled');
    expect(plus).not.toHaveAttribute('aria-disabled');
    await userEvent.click(plus);
    await userEvent.click(minus);
    expect(props.onIncrement).not.toHaveBeenCalled();
    expect(props.onDecrement).not.toHaveBeenCalled();
  });

  it('keeps − enabled on a sold-out row with a stale pick', async () => {
    const stale: OrderCategoryRow = {
      ...categories[2],
      id: 'cat_a',
      quantity: 1,
      selected: true,
      canIncrement: false,
      canDecrement: true,
    };
    const props = renderList({ categories: [stale] });
    expect(screen.getByRole('button', { name: 'Tambah Tribun Bawah' })).toBeDisabled();
    const minus = screen.getByRole('button', { name: 'Kurangi Tribun Bawah' });
    expect(minus).toBeEnabled();
    await userEvent.click(minus);
    expect(props.onDecrement).toHaveBeenCalledWith('cat_a');
  });

  it('keeps an empty, atomic status region when there is no limit notice', () => {
    renderList();
    const region = limitRegion();
    expect(region.tagName).toBe('DIV');
    expect(region).toBeEmptyDOMElement();
  });

  it('shows the limit line after the list, the count in a b', () => {
    renderList({ limitNotice: { count: '3/3', message: 'msg' } });
    const region = limitRegion();
    expect(region).toHaveTextContent('3/3 msg');
    expect(region.querySelector('b')).toHaveTextContent('3/3');
    const list = screen.getByRole('list');
    expect(list.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('inserts and removes the line inside the same mounted region', () => {
    const view = renderList();
    const region = limitRegion();
    view.rerender({ limitNotice: { count: '3/3', message: 'msg' } });
    expect(limitRegion()).toBe(region);
    expect(region).toHaveTextContent('3/3 msg');
    view.rerender({ limitNotice: null });
    expect(limitRegion()).toBe(region);
    expect(region).toBeEmptyDOMElement();
  });

  it('renders the real ID and EN limit copy', () => {
    const fill = (template: string, count: number) => template.replace('{{count}}', String(count));
    const idView = renderList({
      limitNotice: { count: '3/3', message: fill(id.order_limit_reached_other, 3) },
    });
    expect(limitRegion()).toHaveTextContent('3/3 Batas 3 tiket tercapai. Kurangi satu untuk ganti kategori.');
    idView.rerender({ limitNotice: { count: '3/3', message: fill(en.order_limit_reached_other, 3) } });
    expect(limitRegion()).toHaveTextContent("3/3 You've hit the 3-ticket limit. Remove one to switch category.");
    idView.rerender({ limitNotice: { count: '2/2', message: fill(id.order_limit_reached_reserved_other, 2) } });
    expect(limitRegion()).toHaveTextContent(/^2\/2 Kuota giliran Anda 2 tiket\. /);
  });

  it('calls onIncrement / onDecrement with the row id', async () => {
    const props = renderList();
    await userEvent.click(screen.getByRole('button', { name: 'Tambah Festival A' }));
    expect(props.onIncrement).toHaveBeenCalledWith('cat_fa');
    await userEvent.click(screen.getByRole('button', { name: 'Kurangi Festival B' }));
    expect(props.onDecrement).toHaveBeenCalledWith('cat_fb');
    await userEvent.click(screen.getByRole('button', { name: 'Kurangi Festival A' }));
    expect(props.onDecrement).toHaveBeenCalledTimes(1);
    expect(props.onIncrement).toHaveBeenCalledTimes(1);
  });

  it('marks only selected rows with data-selected', () => {
    renderList();
    const items = screen.getAllByRole('listitem');
    expect(items[0]).not.toHaveAttribute('data-selected');
    expect(items[1]).toHaveAttribute('data-selected');
    expect(items[1].querySelector('output')).toHaveTextContent('2');
    expect(items[2]).not.toHaveAttribute('data-selected');
  });
});
