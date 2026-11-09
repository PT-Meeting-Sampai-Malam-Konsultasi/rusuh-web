import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoredQueuePlace } from '@core/protocols/queue-place-store.protocol';

import { RefreshSessionUseCase } from '../refresh-session.use-case';
import { RequestSignInCodeUseCase } from '../request-sign-in-code.use-case';
import { VerifySignInCodeUseCase } from '../verify-sign-in-code.use-case';

const problem = (status: number, code: string, data?: object) => ({ status, code, message: code, data });

const USER = { userId: 'usr_1', email: 'nadia.saputri@gmail.com', fullName: 'Nadia Saputri', locale: 'id' as const };
const SESSION = { accessToken: 'at', expiresIn: 900, isNewAccount: false, user: USER };
const CHALLENGE = { challengeId: 'ch_1', expiresAt: '2026-11-09T10:10:00Z', resendAfterSeconds: 60 };

function setup({ device = 'device' as string | null, places = {} as Record<string, StoredQueuePlace> } = {}) {
  let token: string | null = null;
  return {
    authService: {
      requestOtp: vi.fn().mockResolvedValue({ data: CHALLENGE, status: 202 }),
      verifyOtp: vi.fn().mockResolvedValue({ data: SESSION, status: 200 }),
      refreshSession: vi.fn().mockResolvedValue({ data: { ...SESSION, accessToken: 'at2' }, status: 200 }),
      logout: vi.fn(),
    },
    deviceService: {
      registerDevice: vi.fn().mockResolvedValue({ data: { deviceToken: 'device-new', expiresAt: '' }, status: 201 }),
    },
    deviceTokenStore: { get: vi.fn(() => device), set: vi.fn(), clear: vi.fn() },
    queuePlaceStore: { get: vi.fn((id: string) => places[id] ?? null), set: vi.fn(), remove: vi.fn() },
    turnstile: { getToken: vi.fn(async (action: string) => `ts-${action}`) },
    tokenStore: {
      getAccessToken: vi.fn(() => token),
      setAccessToken: vi.fn((next: string | null) => {
        token = next;
      }),
    },
  };
}

describe('RequestSignInCodeUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends a normalised e-mail with a Turnstile token and returns the challenge', async () => {
    const deps = setup();
    const result = await RequestSignInCodeUseCase(deps).execute({ email: ' Nadia.Saputri@Gmail.com ', locale: 'id' });
    expect(result).toEqual({ kind: 'sent', email: 'nadia.saputri@gmail.com', ...CHALLENGE });
    expect(deps.authService.requestOtp).toHaveBeenCalledWith(
      { email: 'nadia.saputri@gmail.com', locale: 'id' },
      'device',
      { turnstileToken: 'ts-otp' },
    );
  });

  it('uses the stored queue token instead of Turnstile when coming from the waiting room', async () => {
    const deps = setup({ places: { evt_samudra: { queueToken: 'qt', seq: 1, joinedServed: 0 } } });
    await RequestSignInCodeUseCase(deps).execute({ email: 'a@b.id', locale: 'en', eventId: 'evt_samudra' });
    expect(deps.authService.requestOtp.mock.calls[0][2]).toEqual({ queueToken: 'qt' });
    expect(deps.turnstile.getToken).not.toHaveBeenCalled();
  });

  it('falls back to Turnstile when there is no place for the event', async () => {
    const deps = setup();
    await RequestSignInCodeUseCase(deps).execute({ email: 'a@b.id', locale: 'id', eventId: 'evt_x' });
    expect(deps.authService.requestOtp.mock.calls[0][2]).toEqual({ turnstileToken: 'ts-otp' });
  });

  it('registers a device first when the browser has none', async () => {
    const deps = setup({ device: null });
    await RequestSignInCodeUseCase(deps).execute({ email: 'a@b.id', locale: 'id' });
    expect(deps.authService.requestOtp.mock.calls[0][1]).toBe('device-new');
  });

  it('classifies rate limits, with or without a wait', async () => {
    const deps = setup();
    const useCase = RequestSignInCodeUseCase(deps);
    deps.authService.requestOtp.mockRejectedValueOnce(problem(429, 'RATE_LIMITED', { retryAfter: 41.2 }));
    await expect(useCase.execute({ email: 'a@b.id', locale: 'id' })).resolves.toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: 42,
    });
    deps.authService.requestOtp.mockRejectedValueOnce(problem(429, 'TOO_MANY_REQUESTS'));
    await expect(useCase.execute({ email: 'a@b.id', locale: 'id' })).resolves.toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: null,
    });
  });

  it('classifies a rejected e-mail and lets other errors through', async () => {
    const deps = setup();
    const useCase = RequestSignInCodeUseCase(deps);
    deps.authService.requestOtp.mockRejectedValueOnce(problem(400, 'VALIDATION_FAILED'));
    await expect(useCase.execute({ email: 'x', locale: 'id' })).resolves.toEqual({ kind: 'invalid-email' });
    deps.authService.requestOtp.mockRejectedValueOnce(problem(0, 'NETWORK_ERROR'));
    await expect(useCase.execute({ email: 'a@b.id', locale: 'id' })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});

describe('VerifySignInCodeUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the access token and returns the account', async () => {
    const deps = setup();
    await expect(VerifySignInCodeUseCase(deps).execute({ challengeId: 'ch_1', code: '123456' })).resolves.toEqual({
      kind: 'signed-in',
      isNewAccount: false,
      user: USER,
    });
    expect(deps.authService.verifyOtp).toHaveBeenCalledWith({ challengeId: 'ch_1', code: '123456' }, 'device');
    expect(deps.tokenStore.setAccessToken).toHaveBeenCalledWith('at');
  });

  it.each([
    [problem(409, 'WRONG_CODE', { attemptsLeft: 3 }), { kind: 'wrong-code', attemptsLeft: 3 }],
    [problem(409, 'WRONG_CODE'), { kind: 'wrong-code', attemptsLeft: 0 }],
    [problem(410, 'CHALLENGE_EXPIRED'), { kind: 'expired' }],
    [problem(410, 'CHALLENGE_LOCKED'), { kind: 'locked' }],
  ])('classifies %o', async (error, expected) => {
    const deps = setup();
    deps.authService.verifyOtp.mockRejectedValue(error);
    await expect(VerifySignInCodeUseCase(deps).execute({ challengeId: 'ch', code: '000001' })).resolves.toEqual(
      expected,
    );
    expect(deps.tokenStore.setAccessToken).not.toHaveBeenCalled();
  });

  it('lets other errors through', async () => {
    const deps = setup();
    deps.authService.verifyOtp.mockRejectedValue(problem(503, 'INTERNAL_ERROR'));
    await expect(VerifySignInCodeUseCase(deps).execute({ challengeId: 'ch', code: '1' })).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});

describe('RefreshSessionUseCase', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the new access token', async () => {
    const deps = setup();
    await expect(RefreshSessionUseCase(deps).execute()).resolves.toBe(true);
    expect(deps.authService.refreshSession).toHaveBeenCalledWith('device');
    expect(deps.tokenStore.setAccessToken).toHaveBeenCalledWith('at2');
  });

  it('ends the session without a device token or when the refresh fails', async () => {
    const none = setup({ device: null });
    await expect(RefreshSessionUseCase(none).execute()).resolves.toBe(false);
    expect(none.authService.refreshSession).not.toHaveBeenCalled();
    expect(none.tokenStore.setAccessToken).toHaveBeenCalledWith(null);

    const failing = setup();
    failing.authService.refreshSession.mockRejectedValue(problem(401, 'UNAUTHORIZED'));
    await expect(RefreshSessionUseCase(failing).execute()).resolves.toBe(false);
    expect(failing.tokenStore.setAccessToken).toHaveBeenCalledWith(null);
  });
});
