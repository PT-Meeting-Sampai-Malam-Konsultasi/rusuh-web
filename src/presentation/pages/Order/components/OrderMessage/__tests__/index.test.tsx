import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import OrderMessage from '../index';

describe('OrderMessage', () => {
  it('shows the error with retry and a way home', async () => {
    const onAction = vi.fn();
    render(
      <OrderMessage
        title="Kategori gagal dimuat."
        body="Koneksi terputus."
        actionLabel="Coba lagi"
        onAction={onAction}
        homeHref="/"
        homeLabel="Ke beranda"
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Kategori gagal dimuat.');
    expect(screen.getByRole('alert')).toHaveTextContent('Koneksi terputus.');
    await userEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Ke beranda' })).toHaveAttribute('href', '/');
  });

  it('shows not-found without retry', () => {
    render(
      <OrderMessage title="Event tidak ditemukan." body="Lihat event lain." homeHref="/" homeLabel="Ke beranda" />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('link', { name: 'Ke beranda' })).toBeInTheDocument();
  });
});
