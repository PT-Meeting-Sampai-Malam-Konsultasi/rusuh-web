import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ErrorPopup from '../index';

describe('ErrorPopup', () => {
  it('renders nothing when closed', () => {
    render(<ErrorPopup open={false} message="x" closeLabel="Tutup" onClose={vi.fn()} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows the message, focuses close and closes on click and Escape', async () => {
    const onClose = vi.fn();
    render(<ErrorPopup open title="Ups" message="Kode salah." closeLabel="Tutup" onClose={onClose} />);
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName('Ups');
    expect(screen.getByRole('button', { name: 'Tutup' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Tutup' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows the support code under the message only when there is one', () => {
    const { rerender } = render(
      <ErrorPopup open message="Gangguan." reference="Kode bantuan: 3f2a9c1e" closeLabel="Tutup" onClose={vi.fn()} />,
    );
    expect(screen.getByText('Kode bantuan: 3f2a9c1e')).toBeInTheDocument();
    rerender(<ErrorPopup open message="Gangguan." closeLabel="Tutup" onClose={vi.fn()} />);
    expect(screen.queryByText(/Kode bantuan/)).toBeNull();
  });

  it('runs the action and then closes', async () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    render(
      <ErrorPopup
        open
        message="Waktu habis."
        closeLabel="Tutup"
        actionLabel="Antre lagi"
        onAction={onAction}
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Antre lagi' }));
    expect(onAction).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
