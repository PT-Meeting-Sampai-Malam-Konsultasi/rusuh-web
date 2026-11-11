import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';

import type { OrderHolderView } from '@controllers/order.controller';
import en from '@translation/locale/en.json';
import id from '@translation/locale/id.json';

import HolderList from '../index';

const t = ((k: string) => k) as unknown as TFunction;
const tFrom = (dict: Record<string, string>) => ((k: string) => dict[k] ?? k) as unknown as TFunction;

const holder = (index: number, overrides: Partial<OrderHolderView> = {}): OrderHolderView => ({
  key: `cat_fb-${index}`,
  title: `Tiket ${index} · Festival B`,
  holderType: 'other',
  choiceName: `order-holder-${index}-type`,
  selfDisabled: false,
  choose: vi.fn(),
  name: {
    id: `order-holder-${index}-name`,
    value: '',
    readOnly: false,
    hint: 'Dicetak di e-tiket.',
    onChange: vi.fn(),
  },
  nik: { id: `order-holder-${index}-nik`, value: '', onChange: vi.fn(), onFocus: vi.fn(), onBlur: vi.fn() },
  ...overrides,
});

const holders = (): OrderHolderView[] => [
  holder(1, {
    holderType: 'self',
    name: {
      id: 'order-holder-1-name',
      value: 'Nadia Saputri',
      readOnly: true,
      hint: 'Dari profil Anda.',
      onChange: vi.fn(),
    },
  }),
  holder(2, { selfDisabled: true, title: 'Tiket 2 · Festival B' }),
  holder(3, { selfDisabled: true, title: 'Tiket 3 · Tribun Atas' }),
];

describe('HolderList', () => {
  it('is a section labelled by its heading, with the note', () => {
    render(<HolderList t={t} showChoice holders={holders()} />);
    expect(screen.getByRole('region', { name: 'order_holders_heading' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'order_holders_heading' })).toBeInTheDocument();
    expect(screen.getByText('order_holders_note')).toBeInTheDocument();
  });

  it('renders one block per holder with its title as h3, in order', () => {
    render(<HolderList t={t} showChoice holders={holders()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Tiket 1 · Festival B',
      'Tiket 2 · Festival B',
      'Tiket 3 · Tribun Atas',
    ]);
  });

  it('gives each block a radiogroup with self checked / disabled from the view', () => {
    render(<HolderList t={t} showChoice holders={holders()} />);
    const groups = screen.getAllByRole('radiogroup', { name: 'order_holder_for_label' });
    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveAccessibleDescription('Tiket 1 · Festival B');

    const self1 = within(groups[0]).getByRole('radio', { name: 'order_holder_self' });
    const other1 = within(groups[0]).getByRole('radio', { name: 'order_holder_other' });
    expect(self1).toBeChecked();
    expect(self1).toBeEnabled();
    expect(other1).not.toBeChecked();

    const self2 = within(groups[1]).getByRole('radio', { name: 'order_holder_self' });
    expect(self2).toBeDisabled();
    expect(self2).not.toBeChecked();
    expect(within(groups[1]).getByRole('radio', { name: 'order_holder_other' })).toBeChecked();
  });

  it('calls choose with the picked value', async () => {
    const list = holders();
    render(<HolderList t={t} showChoice holders={list} />);
    const group = screen.getAllByRole('radiogroup')[0];
    await userEvent.click(within(group).getByRole('radio', { name: 'order_holder_other' }));
    expect(list[0].choose).toHaveBeenCalledWith('other');
  });

  it('calls choose("self") on an enabled "Saya sendiri" and never on a disabled one', async () => {
    const list = holders();
    list[0] = holder(1);
    render(<HolderList t={t} showChoice holders={list} />);
    const selfs = screen.getAllByRole('radio', { name: 'order_holder_self' });
    await userEvent.click(selfs[0]);
    expect(list[0].choose).toHaveBeenCalledWith('self');
    await userEvent.click(selfs[1]);
    expect(list[1].choose).not.toHaveBeenCalled();
  });

  it('renders plain fields without a radiogroup when there is no choice', () => {
    render(<HolderList t={t} showChoice={false} holders={[holder(1)]} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'order_holder_name_label' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'order_holder_nik_label' })).toBeInTheDocument();
  });

  it('shows the profile name read only with its hint', () => {
    render(<HolderList t={t} showChoice holders={holders()} />);
    const names = screen.getAllByRole('textbox', { name: 'order_holder_name_label' });
    expect(names[0]).toHaveValue('Nadia Saputri');
    expect(names[0]).toHaveAttribute('readonly');
    expect(names[0]).toHaveAccessibleDescription('Dari profil Anda.');
    expect(names[0]).toHaveAttribute('autocomplete', 'off');
    expect(names[1]).not.toHaveAttribute('readonly');
    expect(names[1]).toHaveAccessibleDescription('Dicetak di e-tiket.');
    expect(names[1]).toHaveAttribute('placeholder', 'order_holder_name_placeholder');
  });

  it('passes name typing to the controller', async () => {
    const one = holder(1);
    render(<HolderList t={t} showChoice={false} holders={[one]} />);
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
      },
    });
    render(<HolderList t={t} showChoice={false} holders={[one]} />);
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
    render(<HolderList t={tFrom(id)} showChoice holders={holders()} />);
    const section = screen.getByRole('region');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(section.textContent).not.toMatch(/belum punya NIK|Ubah di Akun|Simpan NIK/);
  });

  it('renders the Indonesian strings', () => {
    render(<HolderList t={tFrom(id)} showChoice holders={holders()} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Pemegang tiket' })).toBeInTheDocument();
    expect(screen.getByText(/1 NIK = 1 tiket per event/)).toBeInTheDocument();
    expect(screen.getAllByRole('radiogroup', { name: 'Untuk siapa tiket ini' })).toHaveLength(3);
    expect(screen.getAllByRole('radio', { name: 'Saya sendiri' })).toHaveLength(3);
    expect(screen.getAllByRole('radio', { name: 'Orang lain' })).toHaveLength(3);
    expect(screen.getAllByRole('textbox', { name: 'Nama sesuai KTP' })[2]).toHaveAttribute(
      'placeholder',
      'Nama lengkap',
    );
    const nik = screen.getAllByRole('textbox', { name: 'NIK' })[0];
    expect(nik).toHaveAttribute('placeholder', '16 digit sesuai KTP');
    expect(nik).toHaveAccessibleDescription('Contoh: 3201 1234 5678 0001');
  });

  it('renders the English strings', () => {
    const list = holders().map((h, index) => ({
      ...h,
      title: `Ticket ${index + 1} · Festival B`,
      name: { ...h.name, hint: index === 0 ? en.order_holder_name_hint_profile : en.order_holder_name_hint },
    }));
    render(<HolderList t={tFrom(en)} showChoice holders={list} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Ticket holders' })).toBeInTheDocument();
    expect(screen.getAllByRole('radiogroup', { name: 'Who is this ticket for' })).toHaveLength(3);
    expect(screen.getAllByRole('radio', { name: 'Myself' })).toHaveLength(3);
    expect(screen.getAllByRole('radio', { name: 'Someone else' })).toHaveLength(3);
    const names = screen.getAllByRole('textbox', { name: 'Name as on the KTP' });
    expect(names[0]).toHaveAccessibleDescription('From your profile.');
    expect(names[1]).toHaveAttribute('placeholder', 'Full name');
    expect(screen.getAllByRole('textbox', { name: 'NIK' })[0]).toHaveAccessibleDescription(
      'Example: 3201 1234 5678 0001',
    );
  });
});
