import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import FlowHeader, { type FlowHeaderStep } from '../index';

const steps: FlowHeaderStep[] = [
  { number: 1, label: 'Pilih tiket', current: true },
  { number: 2, label: 'Bayar', current: false },
  { number: 3, label: 'E-tiket', current: false },
];

const labels = { home: 'Rusuh, ke beranda', steps: 'Langkah', language: 'Bahasa', back: 'Kembali' };

const renderHeader = (overrides: Partial<Parameters<typeof FlowHeader>[0]> = {}) =>
  render(
    <FlowHeader
      homeHref="/"
      steps={steps}
      locale="id"
      onLocaleChange={vi.fn()}
      backHref="/queue?event=evt_samudra"
      title="Pilih tiket"
      labels={labels}
      {...overrides}
    />,
  );

describe('FlowHeader', () => {
  it('links the logo home and lists the steps with the current one marked', () => {
    renderHeader();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rusuh, ke beranda' })).toHaveAttribute('href', '/');
    const list = screen.getByRole('list', { name: 'Langkah' });
    const items = screen.getAllByRole('listitem');
    expect(list.tagName).toBe('OL');
    expect(items.map((item) => item.textContent)).toEqual(['1Pilih tiket', '2Bayar', '3E-tiket']);
    expect(items[0]).toHaveAttribute('aria-current', 'step');
    expect(items[1]).not.toHaveAttribute('aria-current');
  });

  it('switches the language', async () => {
    const onLocaleChange = vi.fn();
    renderHeader({ onLocaleChange });
    expect(screen.getByRole('group', { name: 'Bahasa' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(onLocaleChange).toHaveBeenCalledWith('en');
  });

  it('has a phone back link and title', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: 'Kembali' })).toHaveAttribute('href', '/queue?event=evt_samudra');
    expect(screen.getByText('Pilih tiket', { selector: 'span' })).toBeInTheDocument();
  });

  it('renders no timer without one', () => {
    renderHeader();
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('renders the timer in both bars when given', () => {
    renderHeader({ timer: <span role="timer">4:12</span> });
    expect(screen.getAllByRole('timer')).toHaveLength(2);
  });
});
