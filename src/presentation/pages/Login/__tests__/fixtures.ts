import { vi } from 'vitest';

import type { LoginControllerInterface } from '@controllers/login.controller';

export const t = ((k: string, params?: Record<string, unknown>) =>
  params ? `${k}:${JSON.stringify(params)}` : k) as never;

const field = <N extends string>(name: N) => ({ name, onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() });

export const loginController = (): LoginControllerInterface => ({
  t,
  step: 'email',
  event: {
    name: 'Samudra',
    subtitle: 'Tur Gelombang 2026',
    posterTone: 'blue',
    posterDate: '12.12.26',
    posterPlace: 'GBK · JAKARTA',
    dateLine: 'Sab, 12 Des 2026 · 19.00 WIB',
    venueLine: 'Stadion Utama GBK, Jakarta',
    kicker: 'Antrian dibuka 10.00 WIB',
  },
  emailForm: { field: field('email'), onSubmit: vi.fn(), error: '', submitting: false },
  code: {
    email: 'nadia.saputri@gmail.com',
    length: 6,
    value: '',
    onChange: vi.fn(),
    state: 'idle',
    message: '',
    resendIn: '0:42',
    resendError: '',
    validFor: '9:12',
    onResend: vi.fn(),
    onChangeEmail: vi.fn(),
    onSubmit: vi.fn(),
    submitting: false,
  },
  profileForm: {
    email: 'nadia.saputri@gmail.com',
    field: field('fullName'),
    onSubmit: vi.fn(),
    error: '',
    submitting: false,
    submitLabel: 'login_continue_queue',
  },
  locale: 'id',
  setLocale: vi.fn(),
  homeHref: '/',
});
