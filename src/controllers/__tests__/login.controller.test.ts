import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { HomeEvents } from '@core/use_case/catalog/get-home-events.use-case';

import LoginController from '../login.controller';

const samudra: EventSummary = {
  eventId: 'evt_samudra',
  name: 'Samudra',
  subtitle: 'Tur Gelombang 2026',
  venue: 'Stadion Utama GBK',
  venueShort: 'GBK',
  city: 'Jakarta',
  timezone: 'Asia/Jakarta',
  startsAt: '2026-12-12T12:00:00Z',
  saleOpensAt: '2026-11-09T03:00:00Z',
  state: 'waiting_room_open',
};
const EVENTS = { featured: samudra, others: [], total: 1, serverNow: '2026-11-09T02:00:00Z' } as unknown as HomeEvents;
const USER = { userId: 'usr_1', email: 'nadia.saputri@gmail.com', fullName: 'Nadia Saputri' };
const SENT = {
  kind: 'sent' as const,
  challengeId: 'ch_1',
  email: 'nadia.saputri@gmail.com',
  expiresAt: '2026-11-09T02:10:00Z',
  resendAfterSeconds: 60,
};

type MutationOptions = {
  mutationFn: (input: unknown) => unknown;
  onSuccess: (result: unknown, input?: unknown) => void;
  onError: (error: unknown) => void;
};
const problem = (status: number, code: string) => ({ status, code, message: code });

describe('LoginController', () => {
  let mutations: MutationOptions[];
  let mutate: ReturnType<typeof vi.fn>[];
  let queryOptions: Record<string, unknown>;
  let search: string;
  const toggleLoading = vi.fn();
  const openPopupError = vi.fn();
  const replace = vi.fn();
  const changeLanguage = vi.fn();
  const i18n = { language: 'id', changeLanguage };
  const t = vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  );

  const deps = () => ({
    requestSignInCodeUseCase: { execute: vi.fn().mockResolvedValue(SENT) },
    verifySignInCodeUseCase: { execute: vi.fn() },
    accountService: { getMe: vi.fn(), updateProfile: vi.fn().mockResolvedValue({ data: USER, status: 200 }) },
    getHomeEventsUseCase: { execute: vi.fn().mockResolvedValue(EVENTS) },
    analyticsAdapter: { trackPageView: vi.fn(), trackEvent: vi.fn(), reportError: vi.fn() },
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    ERROR_CODE_MAP: { NETWORK_ERROR: 'error_network_error', UNKNOWN_ERROR: 'error_unknown_error' },
    useTranslation: () => ({ t, i18n }),
    useSearchParamsNext: () => new URLSearchParams(search),
    useRouterNext: () => ({ replace }),
    useLoading: () => ({ isLoading: false, toggleLoading }),
    usePopupError: () => ({ openPopupError, closePopupError: vi.fn() }),
    useQueryTanstack: (options: Record<string, unknown>) => {
      queryOptions = options;
      return { data: options.enabled ? EVENTS : undefined };
    },
    useMutationTanstack: (options: MutationOptions) => {
      const index = mutations.length % 3;
      mutations[index] = options;
      mutations.length = Math.max(mutations.length, index + 1);
      return { mutate: mutate[index], isPending: false };
    },
  });

  const render = (d = deps()) => {
    mutations = [];
    const hook = renderHook(() => {
      mutations.length = 0;
      return LoginController(d as never);
    });
    return { d, hook };
  };
  const requestCode = () => mutations[0];
  const verify = () => mutations[1];
  const saveProfile = () => mutations[2];

  /** Puts the controller on the code step, as if a code was sent at the current time. */
  const toCodeStep = () => act(() => requestCode().onSuccess(SENT));

  beforeEach(() => {
    vi.clearAllMocks();
    mutate = [vi.fn(), vi.fn(), vi.fn()];
    search = 'next=%2Fqueue%3Fevent%3Devt_samudra';
    i18n.language = 'id';
  });

  afterEach(() => vi.useRealTimers());

  it('starts on the e-mail step, tracks the page and loads the event it returns to', () => {
    const { d, hook } = render();
    expect(hook.result.current.step).toBe('email');
    expect(d.analyticsAdapter.trackPageView).toHaveBeenCalledWith('login');
    expect(queryOptions.enabled).toBe(true);
    expect(hook.result.current.event).toMatchObject({
      name: 'Samudra',
      kicker: 'queue_kicker_prequeue:{"time":"10.00 WIB"}',
      venueLine: 'Stadion Utama GBK, Jakarta',
      posterPlace: 'GBK · JAKARTA',
    });
    expect(hook.result.current.profileForm.submitLabel).toBe('login_continue_queue');
  });

  it('goes Home for a missing or off-site next, without loading events', () => {
    search = 'next=https%3A%2F%2Fevil.test';
    const { hook } = render();
    expect(queryOptions.enabled).toBe(false);
    expect(hook.result.current.event).toBeNull();
    expect(hook.result.current.profileForm.submitLabel).toBe('login_continue');
  });

  it('shows a field error for an invalid e-mail and sends nothing', async () => {
    const { hook } = render();
    await act(async () => {
      hook.result.current.emailForm.field.onChange({ target: { name: 'email', value: 'nadia@' } });
      hook.result.current.emailForm.onSubmit();
    });
    expect(hook.result.current.emailForm.error).toBe('login_email_invalid');
    expect(mutate[0]).not.toHaveBeenCalled();
  });

  it('requests a code for a valid e-mail', async () => {
    const { hook } = render();
    await act(async () => {
      await hook.result.current.emailForm.field.onChange({ target: { name: 'email', value: ' nadia@gmail.com ' } });
      hook.result.current.emailForm.onSubmit();
    });
    expect(mutate[0]).toHaveBeenCalledWith('nadia@gmail.com');
  });

  it('requests the code through the use case with the event, toggling loading in every path', async () => {
    const { d, hook } = render();
    await requestCode().mutationFn('nadia@gmail.com');
    expect(d.requestSignInCodeUseCase.execute).toHaveBeenCalledWith({
      email: 'nadia@gmail.com',
      locale: 'id',
      eventId: 'evt_samudra',
    });
    toCodeStep();
    expect(toggleLoading).toHaveBeenCalledTimes(2);
    expect(hook.result.current.step).toBe('code');
    expect(hook.result.current.code).toMatchObject({
      email: 'nadia.saputri@gmail.com',
      resendIn: '1:00',
      validFor: '10:00',
      state: 'idle',
      message: '',
    });
    expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('login_code_requested', { fromEvent: true });

    act(() => requestCode().onError(problem(0, 'NETWORK_ERROR')));
    expect(toggleLoading).toHaveBeenCalledTimes(3);
    expect(openPopupError).toHaveBeenCalledWith({ message: 'error_network_error' });
  });

  it('sends no event id when next names none', async () => {
    search = 'next=%2Faccount';
    const { d } = render();
    await requestCode().mutationFn('a@b.id');
    expect(d.requestSignInCodeUseCase.execute).toHaveBeenCalledWith({ email: 'a@b.id', locale: 'id' });
  });

  it('shows rate limits and a rejected e-mail under the e-mail field', () => {
    const { hook } = render();
    act(() => requestCode().onSuccess({ kind: 'rate-limited', retryAfterSeconds: 42 }));
    expect(hook.result.current.emailForm.error).toBe('login_rate_limited_wait:{"seconds":42}');
    act(() => requestCode().onSuccess({ kind: 'rate-limited', retryAfterSeconds: null }));
    expect(hook.result.current.emailForm.error).toBe('login_rate_limited');
    act(() => requestCode().onSuccess({ kind: 'invalid-email' }));
    expect(hook.result.current.emailForm.error).toBe('login_email_invalid');
    expect(hook.result.current.step).toBe('email');
  });

  it('verifies a full code once, and only digits', () => {
    const { hook } = render();
    toCodeStep();
    act(() => hook.result.current.code.onChange('48a2'));
    expect(hook.result.current.code.value).toBe('482');
    expect(mutate[1]).not.toHaveBeenCalled();
    act(() => hook.result.current.code.onChange('4820199'));
    expect(hook.result.current.code.value).toBe('482019');
    expect(mutate[1]).toHaveBeenCalledWith({ challengeId: 'ch_1', code: '482019' });
    act(() => hook.result.current.code.onSubmit());
    expect(mutate[1]).toHaveBeenCalledTimes(1);
  });

  it('returns to next for an existing account', async () => {
    const { d } = render();
    toCodeStep();
    await verify().mutationFn({ challengeId: 'ch_1', code: '123456' });
    expect(d.verifySignInCodeUseCase.execute).toHaveBeenCalledWith({ challengeId: 'ch_1', code: '123456' });
    act(() => verify().onSuccess({ kind: 'signed-in', isNewAccount: false, user: USER }));
    expect(replace).toHaveBeenCalledWith('/queue?event=evt_samudra');
    expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('login', {
      method: 'email_code',
      from: 'queue',
      event_id: 'evt_samudra',
    });
  });

  it('asks a new account for its name, then saves it with the locale and returns', async () => {
    i18n.language = 'en';
    const { d, hook } = render();
    toCodeStep();
    act(() => verify().onSuccess({ kind: 'signed-in', isNewAccount: true, user: { ...USER, fullName: undefined } }));
    expect(hook.result.current.step).toBe('profile');
    expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('sign_up', {
      method: 'email_code',
      from: 'queue',
      event_id: 'evt_samudra',
    });
    expect(hook.result.current.profileForm.email).toBe('nadia.saputri@gmail.com');
    expect(replace).not.toHaveBeenCalled();

    await act(async () => {
      hook.result.current.profileForm.onSubmit();
    });
    expect(hook.result.current.profileForm.error).toBe('login_name_required');

    await act(async () => {
      await hook.result.current.profileForm.field.onChange({ target: { name: 'fullName', value: ' Nadia S ' } });
      hook.result.current.profileForm.onSubmit();
    });
    expect(mutate[2]).toHaveBeenCalledWith({ fullName: 'Nadia S' });

    await saveProfile().mutationFn({ fullName: ' Nadia S ' });
    expect(d.accountService.updateProfile).toHaveBeenCalledWith({ fullName: 'Nadia S', locale: 'en' });
    act(() => saveProfile().onSuccess(USER));
    expect(replace).toHaveBeenCalledWith('/queue?event=evt_samudra');
    expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('login_profile_saved', {});
  });

  it('shows wrong, expired and locked on the code field; editing clears a wrong code', () => {
    const { hook } = render();
    toCodeStep();
    act(() => verify().onSuccess({ kind: 'wrong-code', attemptsLeft: 2 }));
    expect(hook.result.current.code).toMatchObject({
      state: 'wrong',
      message: 'login_code_wrong:{"attempts":2}',
    });
    act(() => hook.result.current.code.onChange('48201'));
    expect(hook.result.current.code.state).toBe('idle');

    act(() => verify().onSuccess({ kind: 'expired' }));
    expect(hook.result.current.code).toMatchObject({ state: 'expired', message: 'login_code_expired' });
    act(() => verify().onSuccess({ kind: 'locked' }));
    expect(hook.result.current.code).toMatchObject({ state: 'locked', message: 'login_code_locked' });
  });

  it('lets the same code be verified again after a failed request', () => {
    const { hook } = render();
    toCodeStep();
    act(() => hook.result.current.code.onChange('482019'));
    act(() => verify().onError(problem(0, 'NETWORK_ERROR')));
    expect(openPopupError).toHaveBeenCalledWith({ message: 'error_network_error' });
    act(() => hook.result.current.code.onSubmit());
    expect(mutate[1]).toHaveBeenCalledTimes(2);
  });

  it('counts the resend wait and the code validity from the answer', () => {
    vi.useFakeTimers();
    const { hook } = render();
    toCodeStep();
    act(() => vi.advanceTimersByTime(18_000));
    expect(hook.result.current.code.resendIn).toBe('0:42');
    act(() => vi.advanceTimersByTime(43_000));
    expect(hook.result.current.code.resendIn).toBeNull();
    act(() => vi.advanceTimersByTime(600_000));
    expect(hook.result.current.code).toMatchObject({ validFor: '0:00', state: 'expired' });
  });

  it('resends for the same e-mail and shows a resend rate limit on the code step', () => {
    const { hook } = render();
    toCodeStep();
    act(() => hook.result.current.code.onResend());
    expect(mutate[0]).toHaveBeenCalledWith('nadia.saputri@gmail.com');
    act(() => requestCode().onSuccess({ kind: 'rate-limited', retryAfterSeconds: 30 }));
    expect(hook.result.current.code.resendError).toBe('login_rate_limited_wait:{"seconds":30}');
    expect(hook.result.current.emailForm.error).toBe('');
  });

  it('goes back to the e-mail step to change the address', () => {
    const { hook } = render();
    toCodeStep();
    act(() => hook.result.current.code.onChangeEmail());
    expect(hook.result.current.step).toBe('email');
  });

  it('handles profile errors: field, ended session and others', () => {
    const { hook } = render();
    act(() => saveProfile().onError(problem(400, 'VALIDATION_FAILED')));
    expect(hook.result.current.profileForm.error).toBe('login_name_invalid');

    act(() => saveProfile().onError(problem(401, 'UNAUTHORIZED')));
    expect(hook.result.current.step).toBe('email');
    expect(hook.result.current.emailForm.error).toBe('login_session_ended');

    act(() => saveProfile().onError(problem(503, 'INTERNAL_ERROR')));
    expect(openPopupError).toHaveBeenCalledWith({ message: 'error_unknown_error' });
    expect(toggleLoading).toHaveBeenCalledTimes(3);
  });

  it('keeps the chosen language', () => {
    const { d, hook } = render();
    act(() => hook.result.current.setLocale('en'));
    expect(d.storage.set).toHaveBeenCalledWith('rusuh.lang', 'en');
    expect(changeLanguage).toHaveBeenCalledWith('en');
  });
});
