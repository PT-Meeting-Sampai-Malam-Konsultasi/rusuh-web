import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import HomeMessage from '../index';

describe('HomeMessage', () => {
  it('shows the error with a retry button', async () => {
    const onAction = vi.fn();
    render(<HomeMessage title="Gagal" body="Koneksi terputus." actionLabel="Coba lagi" onAction={onAction} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Gagal');
    expect(screen.getByRole('alert')).toHaveTextContent('Koneksi terputus.');
    await userEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state without an action', () => {
    render(<HomeMessage title="Belum ada event." body="Nanti muncul di sini." />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
