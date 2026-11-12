import { act, render, screen } from '@testing-library/react';
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

  const reference = {
    label: 'Kode bantuan: 3f2a9c1e',
    value: '3f2a9c1e-7b4d-4e2a-9c1e-1234567890ab',
    copyLabel: 'Salin',
    copiedLabel: 'Tersalin',
  };

  it('shows the short support code under the message only when there is one', () => {
    const { rerender } = render(
      <ErrorPopup open message="Gangguan." reference={reference} closeLabel="Tutup" onClose={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Kode bantuan: 3f2a9c1e. Salin' })).toHaveTextContent(
      'Kode bantuan: 3f2a9c1eSalin',
    );
    rerender(<ErrorPopup open message="Gangguan." closeLabel="Tutup" onClose={vi.fn()} />);
    expect(screen.queryByText(/Kode bantuan/)).toBeNull();
  });

  it('copies the full request ID, says so for a moment, and keeps the close button focused', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ErrorPopup open message="Gangguan." reference={reference} closeLabel="Tutup" onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Tutup' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: /Kode bantuan/ }));
    expect(writeText).toHaveBeenCalledWith('3f2a9c1e-7b4d-4e2a-9c1e-1234567890ab');
    expect(screen.getByText('✓ Tersalin')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.queryByText('✓ Tersalin')).toBeNull();
    expect(screen.getByText('Salin')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('leaves the code on screen when the clipboard is not available', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
      configurable: true,
    });
    render(<ErrorPopup open message="Gangguan." reference={reference} closeLabel="Tutup" onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /Kode bantuan/ }));
    expect(screen.queryByText('✓ Tersalin')).toBeNull();
    expect(screen.getByText('Kode bantuan: 3f2a9c1e')).toBeInTheDocument();
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
