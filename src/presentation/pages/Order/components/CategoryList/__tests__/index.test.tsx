import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { OrderCategoryView } from '@utils/format/order-event';

import CategoryList from '../index';

const categories: OrderCategoryView[] = [
  {
    id: 'cat_fa',
    name: 'Festival A',
    description: 'Berdiri · paling dekat panggung',
    price: 'Rp 1.250.000',
    availability: 'available',
    availabilityLabel: 'Tersedia',
    soldOut: false,
  },
  {
    id: 'cat_fb',
    name: 'Festival B',
    description: 'Berdiri · di belakang Festival A',
    price: 'Rp 1.100.000',
    availability: 'almost_gone',
    availabilityLabel: 'Hampir habis',
    soldOut: false,
  },
  {
    id: 'cat_tb',
    name: 'Tribun Bawah',
    price: 'Rp 850.000',
    availability: 'sold_out',
    availabilityLabel: 'Habis',
    soldOut: true,
  },
];

const note = 'Maks. 3 tiket per transaksi. Tanpa nomor kursi — masuk sesuai kategori.';

describe('CategoryList', () => {
  it('is a section labelled by its heading, with the note describing the list', () => {
    render(<CategoryList heading="Kategori" note={note} categories={categories} />);
    expect(screen.getByRole('region', { name: 'Kategori' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Kategori' })).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveAccessibleDescription(note);
  });

  it('lists every category in order with its name as h3', () => {
    render(<CategoryList heading="Kategori" note={note} categories={categories} />);
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
    render(<CategoryList heading="Kategori" note={note} categories={categories} />);
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
    render(<CategoryList heading="Kategori" note={note} categories={categories} />);
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
    render(<CategoryList heading="Kategori" note={note} categories={categories} />);
    const last = screen.getAllByRole('listitem')[2];
    expect(last.querySelector('p')).toBeNull();
    expect(within(last).getByText('Rp 850.000')).toBeInTheDocument();
  });

  it('shows no label for an unknown availability but still the price', () => {
    const unknown: OrderCategoryView = {
      id: 'cat_vip',
      name: 'VIP',
      price: 'Rp 3.000.000',
      availability: null,
      availabilityLabel: '',
      soldOut: false,
    };
    render(<CategoryList heading="Kategori" note={note} categories={[unknown]} />);
    const item = screen.getByRole('listitem');
    expect(item.querySelector('[data-availability]')).toBeNull();
    expect(item).not.toHaveAttribute('data-sold-out');
    expect(item.textContent).toBe('VIPRp 3.000.000');
  });

  it('renders the English strings it is given', () => {
    const en: OrderCategoryView[] = [
      { ...categories[1], price: 'Rp 1,100,000', availabilityLabel: 'Almost gone' },
      { ...categories[2], price: 'Rp 850,000', availabilityLabel: 'Sold out' },
    ];
    render(<CategoryList heading="Categories" note="" categories={en} />);
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('Almost gone')).toBeInTheDocument();
    expect(within(items[0]).getByText('Rp 1,100,000')).toBeInTheDocument();
    expect(within(items[1]).getByText('Sold out')).toBeInTheDocument();
  });

  it('has nothing to buy yet: no button, input or counter', () => {
    render(<CategoryList heading="Kategori" note={note} categories={categories} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('list').querySelector('input, output')).toBeNull();
  });
});
