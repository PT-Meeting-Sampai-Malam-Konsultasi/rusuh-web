import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountControllerInterface } from '@controllers/account.controller';

import AccountScreen from '../index';

let controller: AccountControllerInterface;

vi.mock('@infrastructure/di/container', () => ({ default: { resolve: () => controller } }));
vi.mock('@infrastructure/di/controllers/account', () => ({}));

const nameForm = () => ({
  editing: false,
  field: { name: 'fullName' as const, onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() },
  error: '',
  saving: false,
  edit: vi.fn(),
  cancel: vi.fn(),
  onSubmit: vi.fn(),
});

const base = (): AccountControllerInterface => ({
  t: ((key: string) => key) as never,
  status: 'ready',
  profile: { name: 'Nadia Saputri', email: 'nadia.saputri@gmail.com' },
  nameForm: nameForm(),
  signOut: vi.fn(),
  signingOut: false,
  errorMessage: '',
  retry: vi.fn(),
  locale: 'id',
  setLocale: vi.fn(),
  nav: [{ href: '/account', label: 'nav_account', icon: 'account', current: true, desktop: true }],
});

describe('AccountScreen', () => {
  beforeEach(() => {
    controller = base();
  });

  it('shows the name as the hero, the details, how to sign in, and the NIK card', () => {
    render(<AccountScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Nadia Saputri');
    expect(screen.getAllByText('nadia.saputri@gmail.com')).toHaveLength(2);
    expect(screen.getByRole('region', { name: /account_section_profile/ })).toHaveTextContent('Nadia Saputri');
    expect(screen.getByRole('region', { name: /account_section_sign_in/ })).toHaveTextContent('account_verified');
    expect(screen.getByText('account_how_value')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'account_nik_title' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false');
  });

  it('opens the name form, and signs out', async () => {
    render(<AccountScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'account_edit' }));
    expect(controller.nameForm.edit).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'account_sign_out' }));
    expect(controller.signOut).toHaveBeenCalled();
  });

  it('edits the name: field, save, cancel, and an error under the field', async () => {
    controller = { ...base(), nameForm: { ...nameForm(), editing: true, error: 'login_name_invalid' } };
    render(<AccountScreen />);
    expect(screen.getByLabelText('login_name_label')).toBeInTheDocument();
    expect(screen.getByText('login_name_invalid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'account_edit' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'account_save' }));
    expect(controller.nameForm.onSubmit).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'account_cancel' }));
    expect(controller.nameForm.cancel).toHaveBeenCalled();
  });

  it('says the name is missing for an account without one', () => {
    controller = { ...base(), profile: { name: '', email: 'baru@contoh.id' } };
    render(<AccountScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('account_hero_fallback');
    expect(screen.getByText('account_name_missing')).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    controller = { ...base(), status: 'loading', profile: null };
    render(<AccountScreen />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('offers a retry after a failure', async () => {
    controller = { ...base(), status: 'error', profile: null, errorMessage: 'error_internal' };
    render(<AccountScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('account_error_title');
    expect(screen.getByText('error_internal')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'action_retry' }));
    expect(controller.retry).toHaveBeenCalled();
  });
});
