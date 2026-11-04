import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import TextField from '../index';

describe('TextField', () => {
  it('links the label and the hint', async () => {
    const onChange = vi.fn();
    render(<TextField id="email" label="Email" hint="Kami kirim kode ke sini" onChange={onChange} />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAccessibleDescription('Kami kirim kode ke sini');
    await userEvent.type(input, 'a');
    expect(onChange).toHaveBeenCalled();
  });

  it('shows an error as an alert and marks the input invalid', () => {
    render(<TextField id="nik" label="NIK" error="NIK berisi 16 digit" valid="ignored" />);
    expect(screen.getByRole('alert')).toHaveTextContent('NIK berisi 16 digit');
    expect(screen.getByLabelText('NIK')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a valid message', () => {
    render(<TextField id="nik2" label="NIK" valid="Format NIK valid" />);
    expect(screen.getByText('Format NIK valid')).toBeInTheDocument();
    expect(screen.getByLabelText('NIK')).not.toHaveAttribute('aria-invalid');
  });

  it('has no description without a message', () => {
    render(<TextField id="name" label="Nama" />);
    expect(screen.getByLabelText('Nama')).not.toHaveAttribute('aria-describedby');
  });
});
