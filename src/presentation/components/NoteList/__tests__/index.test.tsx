import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import NoteList from '..';

describe('NoteList', () => {
  it('renders a labelled section with one heading per note', () => {
    render(
      <NoteList
        label="Catatan"
        notes={[
          { title: 'Tanpa kata sandi', body: 'Cukup kode dari email.' },
          { title: 'Daftar = masuk', body: 'Email baru dibuatkan akun.' },
        ]}
      />,
    );
    expect(screen.getByRole('region', { name: 'Catatan' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Tanpa kata sandi',
      'Daftar = masuk',
    ]);
    expect(screen.getByText('Cukup kode dari email.')).toBeInTheDocument();
  });
});
