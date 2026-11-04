import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import LanguageSwitch from '../index';

describe('LanguageSwitch', () => {
  it('marks the current language and reports a change', async () => {
    const onChange = vi.fn();
    render(<LanguageSwitch label="Bahasa" locale="id" onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Bahasa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ID' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(onChange).toHaveBeenCalledWith('en');
  });
});
