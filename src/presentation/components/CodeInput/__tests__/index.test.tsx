import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import CodeInput from '..';

function Harness({ initial = '', onChange = vi.fn() }: { initial?: string; onChange?: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <CodeInput
      id="code"
      label="Kode 6 digit"
      digitLabel={(n) => `Digit ${n} dari 6`}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const boxes = () => screen.getAllByRole('textbox');

describe('CodeInput', () => {
  it('renders six labelled boxes in a group, autofill on the first', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Kode 6 digit' })).toBeInTheDocument();
    expect(boxes()).toHaveLength(6);
    expect(screen.getByLabelText('Digit 1 dari 6')).toHaveAttribute('autocomplete', 'one-time-code');
    expect(screen.getByLabelText('Digit 2 dari 6')).toHaveAttribute('autocomplete', 'off');
  });

  it('moves to the next box while typing and ignores letters', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(boxes()[0]);
    await userEvent.keyboard('4a82');
    expect(onChange).toHaveBeenLastCalledWith('482');
    expect(boxes()[3]).toHaveFocus();
  });

  it('fills every box from a paste, wherever it lands', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(boxes()[2]);
    await userEvent.paste('482 019');
    expect(onChange).toHaveBeenLastCalledWith('482019');
    expect(
      boxes()
        .map((b) => (b as HTMLInputElement).value)
        .join(''),
    ).toBe('482019');
  });

  it('takes a whole autofilled code in one box', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(boxes()[0], { target: { value: '123456' } });
    expect(onChange).toHaveBeenLastCalledWith('123456');
  });

  it('replaces a filled digit with the newly typed one', () => {
    const onChange = vi.fn();
    render(<Harness initial="482" onChange={onChange} />);
    fireEvent.change(boxes()[1], { target: { value: '87' } });
    expect(onChange).toHaveBeenLastCalledWith('472');
  });

  it('goes back on Backspace in an empty box, and clears a box', async () => {
    const onChange = vi.fn();
    render(<Harness initial="482" onChange={onChange} />);
    await userEvent.click(boxes()[3]);
    await userEvent.keyboard('{Backspace}');
    expect(onChange).toHaveBeenLastCalledWith('48');
    expect(boxes()[2]).toHaveFocus();
    fireEvent.change(boxes()[0], { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('8');
  });

  it('moves with the arrow keys and marks the group invalid', async () => {
    render(<CodeInput id="c" label="Kode" digitLabel={(n) => `D${n}`} value="12" onChange={vi.fn()} invalid />);
    await userEvent.click(boxes()[1]);
    await userEvent.keyboard('{ArrowLeft}');
    expect(boxes()[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(boxes()[1]).toHaveFocus();
    expect(boxes()[0]).toHaveAttribute('aria-invalid', 'true');
  });
});
