import { render, screen } from '@testing-library/react';
import Link from 'next/link';
import { describe, expect, it } from 'vitest';

import StatusScreen from '../index';

describe('StatusScreen', () => {
  it('renders the title, body, note and actions', () => {
    render(
      <StatusScreen title="Halaman tidak ditemukan." body="Alamat ini tidak ada." note="Aman.">
        <Link href="/">Ke beranda</Link>
      </StatusScreen>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Halaman tidak ditemukan.');
    expect(screen.getByText('Alamat ini tidak ada.')).toBeInTheDocument();
    expect(screen.getByText('Aman.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ke beranda' })).toHaveAttribute('href', '/');
  });

  it('omits the optional parts', () => {
    render(<StatusScreen title="T" body="B" />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
