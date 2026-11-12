import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Switch from '../index';

describe('Switch', () => {
  it('writes its state beside it and reports a toggle', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Switch checked={false} onChange={onChange} onLabel="Aktif" offLabel="Nonaktif" ariaLabel="Cookie analitik" />,
    );
    const toggle = screen.getByRole('switch', { name: 'Cookie analitik' });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText('Nonaktif')).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<Switch checked onChange={onChange} onLabel="Aktif" offLabel="Nonaktif" ariaLabel="Cookie analitik" />);
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByText('Aktif')).toBeInTheDocument();
  });
});
