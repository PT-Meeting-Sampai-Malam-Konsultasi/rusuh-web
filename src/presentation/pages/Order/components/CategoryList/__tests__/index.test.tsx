import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { OrderCategoryView } from '@utils/format/order-event';

import CategoryList from '../index';

const categories: OrderCategoryView[] = [
  { id: 'cat_fa', name: 'Festival A', description: 'Berdiri · paling dekat panggung' },
  { id: 'cat_fb', name: 'Festival B', description: 'Berdiri · di belakang Festival A' },
  { id: 'cat_tb', name: 'Tribun Bawah' },
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

  it('shows the name only when there is no description, and nothing to buy yet', () => {
    render(<CategoryList heading="Kategori" note={note} categories={categories} />);
    const last = screen.getAllByRole('listitem')[2];
    expect(last.querySelector('p')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/Rp/)).toBeNull();
  });
});
