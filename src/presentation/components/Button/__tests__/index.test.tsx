import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import Button from '../index';

describe('Button', () => {
  it('renders a button that fires onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Masuk antrian</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Masuk antrian' }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('is disabled and marked busy while busy', async () => {
    const onClick = vi.fn();
    render(
      <Button busy variant="secondary" fullWidth onClick={onClick}>
        Bayar
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Bayar' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
