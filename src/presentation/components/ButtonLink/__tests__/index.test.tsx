import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ButtonLink from '../index';

describe('ButtonLink', () => {
  it('is a link with the button look that reports the click', async () => {
    const onClick = vi.fn();
    render(
      <ButtonLink href="/queue?event=evt_1" onClick={onClick}>
        Masuk antrian
      </ButtonLink>,
    );
    const link = screen.getByRole('link', { name: 'Masuk antrian' });
    expect(link).toHaveAttribute('href', '/queue?event=evt_1');
    expect(link.className).toContain('button');
    expect(link.className).toContain('primary');
    await userEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('takes the secondary variant, the small size and full width', () => {
    render(
      <ButtonLink href="/" variant="secondary" size="sm" fullWidth>
        Tetap antre
      </ButtonLink>,
    );
    const { className } = screen.getByRole('link');
    expect(className).toContain('secondary');
    expect(className).toContain('sm');
    expect(className).toContain('full');
  });

  it('takes an accessible name when the label needs context', () => {
    render(
      <ButtonLink href="/queue?event=evt_rimba" ariaLabel="Tetap antre: Rimba — Pesta Akar">
        Tetap antre
      </ButtonLink>,
    );
    expect(screen.getByRole('link', { name: 'Tetap antre: Rimba — Pesta Akar' })).toBeInTheDocument();
  });
});
