import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';

import type { OrderHolderView } from '@controllers/order.controller';
import en from '@translation/locale/en.json';
import id from '@translation/locale/id.json';

import HolderList from '../index';

const t = ((k: string) => k) as unknown as TFunction;
const tFrom = (dict: Record<string, string>) => ((k: string) => dict[k] ?? k) as unknown as TFunction;

const nikField = (index: number, overrides: Partial<OrderHolderView['nik']> = {}): OrderHolderView['nik'] => ({
  id: `order-holder-${index}-nik`,
  value: '3201 1252 0396 0001',
  onChange: vi.fn(),
  onFocus: vi.fn(),
  onBlur: vi.fn(),
  checking: false,
  canRecheck: false,
  recheck: vi.fn(),
  ...overrides,
});

const interpolate = (text: string, values: Record<string, unknown> = {}) =>
  text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? ''));

const holder = (index: number, overrides: Partial<OrderHolderView> = {}): OrderHolderView => ({
  key: `cat_fb-${index}`,
  title: `Tiket ${index} · Festival B`,
  name: {
    id: `order-holder-${index}-name`,
    value: '',
    hint: 'Dicetak di e-tiket.',
    onChange: vi.fn(),
    onBlur: vi.fn(),
  },
  nik: {
    id: `order-holder-${index}-nik`,
    value: '',
    onChange: vi.fn(),
    onFocus: vi.fn(),
    onBlur: vi.fn(),
    checking: false,
    canRecheck: false,
    recheck: vi.fn(),
  },
  ...overrides,
});

const holders = (): OrderHolderView[] => [
  holder(1),
  holder(2, { title: 'Tiket 2 · Festival B' }),
  holder(3, { title: 'Tiket 3 · Tribun Atas' }),
];

describe('HolderList', () => {
  it('is a section labelled by its heading, with the note', () => {
    render(<HolderList t={t} holders={holders()} />);
    expect(screen.getByRole('region', { name: 'order_holders_heading' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'order_holders_heading' })).toBeInTheDocument();
    expect(screen.getByText('order_holders_note')).toBeInTheDocument();
  });

  it('renders one block per holder with its title as h3, in order', () => {
    render(<HolderList t={t} holders={holders()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Tiket 1 · Festival B',
      'Tiket 2 · Festival B',
      'Tiket 3 · Tribun Atas',
    ]);
  });

  it('has no "Saya sendiri / Orang lain" choice: plain, editable name and NIK fields (D17)', () => {
    render(<HolderList t={t} holders={holders()} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    const names = screen.getAllByRole('textbox', { name: 'order_holder_name_label' });
    expect(names).toHaveLength(3);
    for (const name of names) {
      expect(name).not.toHaveAttribute('readonly');
      expect(name).toHaveAccessibleDescription('Dicetak di e-tiket.');
      expect(name).toHaveAttribute('autocomplete', 'off');
      expect(name).toHaveAttribute('placeholder', 'order_holder_name_placeholder');
    }
    expect(screen.getAllByRole('textbox', { name: 'order_holder_nik_label' })).toHaveLength(3);
  });

  it('passes name typing to the controller', async () => {
    const one = holder(1);
    render(<HolderList t={t} holders={[one]} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'order_holder_name_label' }), 'R');
    expect(one.name.onChange).toHaveBeenCalledWith('R');
  });

  it('renders the NIK field with numeric input and forwards focus, change and blur', async () => {
    const one = holder(1, {
      nik: {
        id: 'order-holder-1-nik',
        value: '3174 •••• •••• 0004',
        onChange: vi.fn(),
        onFocus: vi.fn(),
        onBlur: vi.fn(),
        checking: false,
        canRecheck: false,
        recheck: vi.fn(),
      },
    });
    render(<HolderList t={t} holders={[one]} />);
    const nik = screen.getByRole('textbox', { name: 'order_holder_nik_label' });
    expect(nik).toHaveValue('3174 •••• •••• 0004');
    expect(nik).toHaveAttribute('inputmode', 'numeric');
    expect(nik).toHaveAttribute('autocomplete', 'off');
    expect(nik).toHaveAttribute('spellcheck', 'false');
    expect(nik).toHaveAttribute('placeholder', 'order_holder_nik_placeholder');
    expect(nik).toHaveAccessibleDescription('order_holder_nik_hint');

    await userEvent.click(nik);
    expect(one.nik.onFocus).toHaveBeenCalledTimes(1);
    await userEvent.type(nik, '1');
    expect(one.nik.onChange).toHaveBeenCalledWith('3174 •••• •••• 00041');
    await userEvent.tab();
    expect(one.nik.onBlur).toHaveBeenCalledTimes(1);
  });

  it('has no profile-NIK card, save-to-profile checkbox or NIK messages (ADR-0007, FR-15-W1)', () => {
    render(<HolderList t={tFrom(id)} holders={holders()} />);
    const section = screen.getByRole('region');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(section.textContent).not.toMatch(/belum punya NIK|Ubah di Akun|Simpan NIK/);
  });

  it('renders the Indonesian strings', () => {
    render(<HolderList t={tFrom(id)} holders={holders()} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Pemegang tiket' })).toBeInTheDocument();
    expect(screen.getByText(/1 NIK = 1 tiket per event/)).toBeInTheDocument();
    expect(screen.queryByText('Saya sendiri')).toBeNull();
    expect(screen.queryByText('Orang lain')).toBeNull();
    expect(screen.getAllByRole('textbox', { name: 'Nama sesuai KTP' })[2]).toHaveAttribute(
      'placeholder',
      'Nama lengkap',
    );
    const nik = screen.getAllByRole('textbox', { name: 'NIK' })[0];
    expect(nik).toHaveAttribute('placeholder', '16 digit sesuai KTP');
    expect(nik).toHaveAccessibleDescription('Contoh: 3201 1252 0396 0001');
  });

  it('renders the English strings', () => {
    const list = holders().map((h, index) => ({
      ...h,
      title: `Ticket ${index + 1} · Festival B`,
      name: { ...h.name, hint: en.order_holder_name_hint },
    }));
    render(<HolderList t={tFrom(en)} holders={list} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Ticket holders' })).toBeInTheDocument();
    expect(screen.queryByText('Myself')).toBeNull();
    const names = screen.getAllByRole('textbox', { name: 'Name as on the KTP' });
    expect(names[0]).toHaveAccessibleDescription('Printed on the e-ticket.');
    expect(names[1]).toHaveAttribute('placeholder', 'Full name');
    expect(screen.getAllByRole('textbox', { name: 'NIK' })[0]).toHaveAccessibleDescription(
      'Example: 3201 1252 0396 0001',
    );
  });

  describe('NIK check states (FR-15-W1)', () => {
    const nikInput = () => screen.getByRole('textbox', { name: 'order_holder_nik_label' });
    const one = (nik: Partial<OrderHolderView['nik']> = {}) => holder(1, { nik: nikField(1, nik) });

    it('idle: example hint, no alert, no aria-busy, empty status, no recheck', () => {
      render(<HolderList t={t} holders={[one()]} />);
      expect(nikInput()).toHaveAccessibleDescription('order_holder_nik_hint');
      expect(nikInput()).not.toHaveAttribute('aria-busy');
      expect(nikInput()).not.toHaveAttribute('aria-invalid');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent('');
      expect(screen.queryByRole('button', { name: 'order_nik_recheck' })).toBeNull();
    });

    it('checking: aria-busy, editable, described by the checking line, status announces it', async () => {
      const view = one({ checking: true });
      render(<HolderList t={t} holders={[view]} />);
      const input = nikInput();
      expect(input).toHaveAttribute('aria-busy', 'true');
      expect(input).toBeEnabled();
      expect(input).not.toHaveAttribute('readonly');
      expect(input).toHaveAccessibleDescription('order_nik_checking');
      expect(screen.getByRole('status')).toHaveTextContent('order_nik_checking');
      expect(screen.queryByRole('alert')).toBeNull();
      await userEvent.type(input, '2');
      expect(view.nik.onChange).toHaveBeenCalledWith('3201 1252 0396 00012');
      expect(input).toHaveFocus();
    });

    it('valid: tick line and status text, no alert', () => {
      render(<HolderList t={t} holders={[one({ valid: 'order_nik_valid' })]} />);
      const input = nikInput();
      expect(input).toHaveAccessibleDescription('order_nik_valid');
      expect(input).not.toHaveAttribute('aria-invalid');
      expect(screen.getByText('✓')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('order_nik_valid');
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it.each([
      ['local incomplete', 'order_nik_incomplete'],
      ['local structure', 'order_nik_invalid_structure'],
      ['local duplicate', 'order_nik_duplicate'],
      ['Dukcapil mismatch', 'error_nik_invalid'],
      ['seat taken', 'error_nik_seat_taken order_nik_use_another'],
      ['server duplicate', 'error_duplicate_nik'],
    ])('error (%s): red alert line, aria-invalid, no recheck, status quiet', (_, message) => {
      render(<HolderList t={t} holders={[one({ error: message })]} />);
      expect(screen.getByRole('alert')).toHaveTextContent(`!${message}`);
      expect(nikInput()).toHaveAttribute('aria-invalid', 'true');
      expect(nikInput()).toHaveAccessibleDescription(message);
      expect(screen.getByRole('status')).toHaveTextContent('');
      expect(screen.queryByRole('button', { name: 'order_nik_recheck' })).toBeNull();
    });

    it.each([['order_nik_rate_limited'], ['order_nik_rate_limited_later'], ['order_nik_unavailable']])(
      'retryable error (%s): recheck button described by the message calls recheck once',
      async (message) => {
        const view = one({ error: message, canRecheck: true });
        render(<HolderList t={t} holders={[view]} />);
        expect(screen.getByRole('alert')).toHaveTextContent(message);
        const button = screen.getByRole('button', { name: 'order_nik_recheck' });
        expect(button).toHaveAttribute('type', 'button');
        expect(button).toHaveAttribute('aria-describedby', 'order-holder-1-nik-message');
        expect(button).toHaveAccessibleDescription(message);
        await userEvent.click(button);
        expect(view.nik.recheck).toHaveBeenCalledTimes(1);
      },
    );

    it('keeps one status node per holder across idle → checking → valid', () => {
      const { rerender } = render(<HolderList t={t} holders={[one()]} />);
      const status = screen.getByRole('status');
      rerender(<HolderList t={t} holders={[one({ checking: true })]} />);
      expect(screen.getByRole('status')).toBe(status);
      expect(status).toHaveTextContent('order_nik_checking');
      rerender(<HolderList t={t} holders={[one({ valid: 'order_nik_valid' })]} />);
      expect(screen.getByRole('status')).toBe(status);
      expect(status).toHaveTextContent('order_nik_valid');
    });

    it('renders exactly one status region per holder block', () => {
      render(<HolderList t={t} holders={holders()} />);
      for (const item of screen.getAllByRole('listitem')) {
        expect(within(item).getAllByRole('status')).toHaveLength(1);
      }
    });

    it('forwards name blur and NIK blur', () => {
      const view = one();
      render(<HolderList t={t} holders={[view]} />);
      fireEvent.blur(screen.getByRole('textbox', { name: 'order_holder_name_label' }));
      expect(view.name.onBlur).toHaveBeenCalledTimes(1);
      fireEvent.blur(nikInput());
      expect(view.nik.onBlur).toHaveBeenCalledTimes(1);
    });

    it('leaving the name field by keyboard calls name.onBlur', async () => {
      const view = one();
      render(<HolderList t={t} holders={[view]} />);
      await userEvent.click(screen.getByRole('textbox', { name: 'order_holder_name_label' }));
      await userEvent.tab();
      expect(view.name.onBlur).toHaveBeenCalledTimes(1);
      expect(view.nik.onFocus).toHaveBeenCalledTimes(1);
    });

    it('renders the Indonesian duplicate, rate-limited, checking and recheck strings', () => {
      const list = [
        holder(1, { nik: nikField(1, { error: interpolate(id.order_nik_duplicate, { index: 1 }) }) }),
        holder(2, {
          nik: nikField(2, {
            error: interpolate(id.order_nik_rate_limited_other, { count: 60 }),
            canRecheck: true,
          }),
        }),
        holder(3, { nik: nikField(3, { checking: true }) }),
      ];
      render(<HolderList t={tFrom(id)} holders={list} />);
      const alerts = screen.getAllByRole('alert');
      expect(alerts[0]).toHaveTextContent(
        'NIK ini sudah dipakai di Tiket 1. Setiap tiket butuh NIK orang yang berbeda.',
      );
      expect(alerts[1]).toHaveTextContent('Terlalu banyak percobaan untuk tiket ini. Coba lagi dalam 60 detik.');
      expect(screen.getByRole('button', { name: 'Periksa lagi' })).toBeInTheDocument();
      expect(screen.getAllByRole('textbox', { name: 'NIK' })[2]).toHaveAccessibleDescription('Memeriksa ke Dukcapil…');
    });

    it('renders the English duplicate, rate-limited, checking and recheck strings', () => {
      const list = [
        holder(1, { nik: nikField(1, { error: interpolate(en.order_nik_duplicate, { index: 1 }) }) }),
        holder(2, {
          nik: nikField(2, {
            error: interpolate(en.order_nik_rate_limited_other, { count: 60 }),
            canRecheck: true,
          }),
        }),
        holder(3, { nik: nikField(3, { valid: en.order_nik_valid }) }),
      ];
      render(<HolderList t={tFrom(en)} holders={list} />);
      const alerts = screen.getAllByRole('alert');
      expect(alerts[0]).toHaveTextContent(
        "This NIK is already on Ticket 1. Each ticket needs a different person's NIK.",
      );
      expect(alerts[1]).toHaveTextContent('Too many tries for this ticket. Try again in 60 seconds.');
      expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
      expect(screen.getAllByRole('status')[2]).toHaveTextContent("Name and NIK match Dukcapil's records.");
    });
  });

  it('styles the NIK cell, recheck states and sr-only region with tokens only', () => {
    const css = readFileSync(join(__dirname, '..', 'holder-list.module.css'), 'utf8');
    expect(css.startsWith('@reference "../../../../../styles/app.css";')).toBe(true);
    expect(css).toMatch(/\.nikCell\s*\{/);
    expect(css).toMatch(/\.srOnly\s*\{\s*@apply sr-only;/);
    const recheck = css.slice(css.indexOf('.recheck {'));
    for (const state of ['&:hover', '&:focus-visible', '&:active', '&:disabled']) {
      expect(recheck).toContain(state);
    }
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.recheck\s*\{\s*transition: none;/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
