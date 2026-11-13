import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ConsentBanner from '../index';

const labels = { title: 'Boleh?', body: 'Tanpa data pribadi.', more: 'Info', accept: 'Terima', decline: 'Tolak' };

describe('ConsentBanner', () => {
  it('renders nothing when hidden', () => {
    const { container } = render(
      <ConsentBanner
        visible={false}
        compact={false}
        labels={labels}
        onAccept={vi.fn()}
        onDecline={vi.fn()}
        onMore={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('accepts, declines or opens the settings, Tolak first and Terima the main button', async () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    const onMore = vi.fn();
    render(
      <ConsentBanner
        visible
        compact={false}
        labels={labels}
        onAccept={onAccept}
        onDecline={onDecline}
        onMore={onMore}
      />,
    );
    const banner = screen.getByRole('complementary', { name: 'Boleh?' });
    expect(banner).toHaveAttribute('data-consent-banner', 'full');
    const buttons = screen.getAllByRole('button').filter((b) => b.textContent !== 'Info');
    expect(buttons.map((b) => b.textContent)).toEqual(['Tolak', 'Terima']);
    await userEvent.click(screen.getByRole('button', { name: 'Terima' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tolak' }));
    await userEvent.click(screen.getByRole('button', { name: 'Info' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('marks the short waiting-room version', () => {
    render(<ConsentBanner visible compact labels={labels} onAccept={vi.fn()} onDecline={vi.fn()} onMore={vi.fn()} />);
    expect(screen.getByRole('complementary')).toHaveAttribute('data-consent-banner', 'compact');
  });
});
