import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AccountController from '../account.controller';

interface QueryState {
  data?: unknown;
  isError?: boolean;
  error?: { status: number; code: string; message: string } | null;
}

const NADIA = { userId: 'usr_1', email: 'nadia.saputri@gmail.com', fullName: 'Nadia Saputri', locale: 'id' };

describe('AccountController', () => {
  let queryOptions: Record<string, unknown>;
  let queryState: QueryState;
  const mutations: Record<string, Record<string, (...args: never[]) => unknown>> = {};
  const mutate = vi.fn();
  const refetch = vi.fn();
  const router = { replace: vi.fn(), push: vi.fn() };
  const queryClient = { setQueryData: vi.fn(), removeQueries: vi.fn() };
  const toggleLoading = vi.fn();
  const openPopupError = vi.fn();
  const changeLanguage = vi.fn();
  const i18n = { language: 'id', changeLanguage };
  const t = vi.fn((key: string) => key);

  const deps = () => ({
    accountService: {
      getMe: vi.fn().mockResolvedValue({ data: NADIA, status: 200 }),
      updateProfile: vi.fn().mockResolvedValue({ data: { ...NADIA, fullName: 'Nadia S.' }, status: 200 }),
    },
    signOutUseCase: { execute: vi.fn().mockResolvedValue({ revoked: true }) },
    analyticsAdapter: { trackPageView: vi.fn(), trackEvent: vi.fn(), reportError: vi.fn() },
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    ERROR_CODE_MAP: { INTERNAL_ERROR: 'error_internal', UNKNOWN_ERROR: 'error_unknown_error' },
    useTranslation: () => ({ t, i18n }),
    useQueryTanstack: (options: Record<string, unknown>) => {
      queryOptions = options;
      return { data: undefined, isError: false, error: null, refetch, ...queryState };
    },
    useMutationTanstack: (options: Record<string, (...args: never[]) => unknown>) => {
      const name = String(options.mutationFn).includes('signOutUseCase') ? 'signOut' : 'saveName';
      mutations[name] = options;
      return { mutate, isPending: false };
    },
    useQueryClientTanstack: () => queryClient,
    useRouterNext: () => router,
    useLoading: () => ({ isLoading: false, toggleLoading }),
    usePopupError: () => ({ openPopupError, closePopupError: vi.fn() }),
  });

  const render = (d = deps()) => renderHook(() => AccountController(d as never));
  const run = (name: string, key: string, ...args: unknown[]) =>
    (mutations[name][key] as (...a: unknown[]) => unknown)(...args);

  beforeEach(() => {
    vi.clearAllMocks();
    queryState = {};
    i18n.language = 'id';
  });

  it('reads who is signed in and tracks the page once', async () => {
    const d = deps();
    queryState = { data: NADIA };
    const { result } = render(d);
    expect(result.current.status).toBe('ready');
    expect(result.current.profile).toEqual({ name: 'Nadia Saputri', email: 'nadia.saputri@gmail.com' });
    expect(queryOptions).toMatchObject({ queryKey: ['me'], retry: false });
    await expect((queryOptions.queryFn as () => Promise<unknown>)()).resolves.toEqual(NADIA);
    expect(d.analyticsAdapter.trackPageView).toHaveBeenCalledWith('account');
    expect(result.current.nav.find((item) => item.current)?.icon).toBe('account');
  });

  it('loads first, and shows an empty name for an account without one', () => {
    expect(render().result.current.status).toBe('loading');
    queryState = { data: { ...NADIA, fullName: undefined } };
    expect(render().result.current.profile?.name).toBe('');
  });

  it('sends a signed-out visitor to sign in, back to the account', () => {
    queryState = { isError: true, error: { status: 401, code: 'UNAUTHORIZED', message: 'x' } };
    const { result } = render();
    expect(result.current.status).toBe('loading');
    expect(router.replace).toHaveBeenCalledWith('/login?next=%2Faccount');
  });

  it('shows other failures with a retry', () => {
    queryState = { isError: true, error: { status: 503, code: 'INTERNAL_ERROR', message: 'x' } };
    const { result } = render();
    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('error_internal');
    result.current.retry();
    expect(refetch).toHaveBeenCalled();
  });

  it('edits the name: opens with the current one, cancels, validates and saves', async () => {
    queryState = { data: NADIA };
    const { result } = render();
    act(() => result.current.nameForm.edit());
    expect(result.current.nameForm.editing).toBe(true);
    act(() => result.current.nameForm.cancel());
    expect(result.current.nameForm.editing).toBe(false);

    act(() => result.current.nameForm.edit());
    await act(async () => {
      result.current.nameForm.onSubmit();
    });
    expect(mutate).toHaveBeenCalledWith({ fullName: 'Nadia Saputri' });
  });

  it('refuses an empty name before calling the API', async () => {
    queryState = { data: { ...NADIA, fullName: '' } };
    const { result } = render();
    act(() => result.current.nameForm.edit());
    await act(async () => {
      result.current.nameForm.onSubmit();
    });
    await waitFor(() => expect(result.current.nameForm.error).toBe('login_name_required'));
    expect(mutate).not.toHaveBeenCalled();
  });

  it('saves the trimmed name with the current language, then closes the form', async () => {
    const d = deps();
    queryState = { data: NADIA };
    const { result } = render(d);
    act(() => result.current.nameForm.edit());
    await expect(run('saveName', 'mutationFn', { fullName: '  Nadia S. ' })).resolves.toMatchObject({
      fullName: 'Nadia S.',
    });
    expect(d.accountService.updateProfile).toHaveBeenCalledWith({ fullName: 'Nadia S.', locale: 'id' });
    act(() => {
      run('saveName', 'onSuccess', { ...NADIA, fullName: 'Nadia S.' });
    });
    expect(queryClient.setQueryData).toHaveBeenCalledWith(['me'], { ...NADIA, fullName: 'Nadia S.' });
    expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('account_name_saved', {});
    expect(result.current.nameForm.editing).toBe(false);
    expect(toggleLoading).toHaveBeenCalledTimes(2);
  });

  it('shows a refused name under the field, sends an ended session to sign in, and pops up the rest', () => {
    queryState = { data: NADIA };
    const { result } = render();
    act(() => {
      run('saveName', 'onError', { status: 400, code: 'VALIDATION_FAILED', message: 'x' });
    });
    expect(result.current.nameForm.error).toBe('login_name_invalid');
    run('saveName', 'onError', { status: 401, code: 'UNAUTHORIZED', message: 'x' });
    expect(router.replace).toHaveBeenCalledWith('/login?next=%2Faccount');
    run('saveName', 'onError', { status: 503, code: 'INTERNAL_ERROR', message: 'x', requestId: '3f2a9c1e-7b4d-4e2a' });
    expect(openPopupError).toHaveBeenCalledWith({ message: 'error_internal', reference: '3f2a9c1e-7b4d-4e2a' });
    expect(toggleLoading).toHaveBeenCalledTimes(3);
  });

  it('signs out, forgets the profile and goes Home', async () => {
    const d = deps();
    queryState = { data: NADIA };
    const { result } = render(d);
    result.current.signOut();
    expect(mutate).toHaveBeenCalled();
    await expect(run('signOut', 'mutationFn')).resolves.toEqual({ revoked: true });
    run('signOut', 'onSuccess', { revoked: true });
    expect(queryClient.removeQueries).toHaveBeenCalledWith({ queryKey: ['me'] });
    expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('account_sign_out', { revoked: true });
    expect(router.replace).toHaveBeenCalledWith('/');
    run('signOut', 'onError', { status: 0, code: 'SOMETHING', message: 'x' });
    expect(openPopupError).toHaveBeenCalledWith({ message: 'error_unknown_error' });
    expect(toggleLoading).toHaveBeenCalledTimes(3);
  });

  it('switches language and remembers it', () => {
    const d = deps();
    const { result } = render(d);
    result.current.setLocale('en');
    expect(d.storage.set).toHaveBeenCalledWith('rusuh.lang', 'en');
    expect(changeLanguage).toHaveBeenCalledWith('en');
  });
});
