// @vitest-environment node
// Node: Axios uses its http adapter here, so the request really leaves the app and MSW answers it.
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { AccountService } from '@core/services/account.service';
import { AuthService } from '@core/services/auth.service';
import { createHttpAdapter } from '@infrastructure/adapters/http.adapter';

import { MOCK_KNOWN_EMAIL, MOCK_OTP_CODE } from '../handlers/auth.handlers';
import { createHandlers } from '../handlers/handlers';
import type { MockScenario } from '../scenario';

const CORE = 'https://core.mock.test/v1';
let now = new Date('2026-11-09T03:00:00Z');
let scenario: MockScenario = 'ok';
let accessToken: string | null = null;

const server = setupServer(
  ...createHandlers({
    coreApiUrl: CORE,
    queueApiUrl: 'https://queue.mock.test/v1',
    getScenario: () => scenario,
    now: () => now,
  }),
);
const coreHttp = createHttpAdapter({ baseUrl: CORE, timeoutMs: 5000, getAccessToken: () => accessToken });
const auth = AuthService({ coreHttp });
const account = AccountService({ coreHttp });
const gate = { turnstileToken: 'ts' };
const later = (seconds: number) => {
  now = new Date(now.getTime() + seconds * 1000);
};

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  scenario = 'ok';
  accessToken = null;
  later(3600);
});
afterAll(() => server.close());

const request = (email: string) => auth.requestOtp({ email, locale: 'id' }, 'device', gate);

describe('auth mock', () => {
  it('sends a 10-minute code and signs a known account straight in', async () => {
    const { data, status } = await request(MOCK_KNOWN_EMAIL);
    expect(status).toBe(202);
    expect(data.resendAfterSeconds).toBe(60);
    expect(Date.parse(data.expiresAt) - now.getTime()).toBe(600_000);

    const session = await auth.verifyOtp({ challengeId: data.challengeId, code: MOCK_OTP_CODE }, 'device');
    expect(session.data).toMatchObject({ isNewAccount: false, user: { fullName: 'Nadia Saputri' } });
  });

  it('creates a new account that saves its name, then is known', async () => {
    const email = `baru${Date.now()}@example.com`;
    const first = await request(email);
    const session = await auth.verifyOtp({ challengeId: first.data.challengeId, code: MOCK_OTP_CODE }, 'device');
    expect(session.data.isNewAccount).toBe(true);

    accessToken = session.data.accessToken;
    await expect(account.updateProfile({ fullName: '  ' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const saved = await account.updateProfile({ fullName: 'Budi Santoso', locale: 'en' });
    expect(saved.data).toMatchObject({ email, fullName: 'Budi Santoso', locale: 'en' });
    await expect(account.getMe()).resolves.toMatchObject({ data: { fullName: 'Budi Santoso' } });

    later(61);
    const again = await request(email);
    const back = await auth.verifyOtp({ challengeId: again.data.challengeId, code: MOCK_OTP_CODE }, 'device');
    expect(back.data.isNewAccount).toBe(false);
  });

  it('counts wrong codes down to locked, and answers 000000 as expired', async () => {
    const { data } = await request('wrong@example.com');
    const verify = (code: string) => auth.verifyOtp({ challengeId: data.challengeId, code }, 'device');
    await expect(verify('111111')).rejects.toMatchObject({
      status: 409,
      code: 'WRONG_CODE',
      data: { attemptsLeft: 4 },
    });
    for (let i = 0; i < 3; i += 1) await expect(verify('111111')).rejects.toMatchObject({ code: 'WRONG_CODE' });
    await expect(verify('111111')).rejects.toMatchObject({ status: 410, code: 'CHALLENGE_LOCKED' });
    await expect(verify('000000')).rejects.toMatchObject({ code: 'CHALLENGE_EXPIRED' });
  });

  it('expires a code after 10 minutes and keeps one active code per e-mail', async () => {
    const first = await request('expire@example.com');
    later(61);
    const second = await request('expire@example.com');
    await expect(
      auth.verifyOtp({ challengeId: first.data.challengeId, code: MOCK_OTP_CODE }, 'device'),
    ).rejects.toMatchObject({ code: 'CHALLENGE_EXPIRED' });
    later(601);
    await expect(
      auth.verifyOtp({ challengeId: second.data.challengeId, code: MOCK_OTP_CODE }, 'device'),
    ).rejects.toMatchObject({ code: 'CHALLENGE_EXPIRED' });
  });

  it('rate-limits a resend within 60 s and e-mails containing "limit"', async () => {
    await request('again@example.com');
    later(18);
    await expect(request('again@example.com')).rejects.toMatchObject({ status: 429, data: { retryAfter: 42 } });
    await expect(request('limit@example.com')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('rejects a bad e-mail, a missing device or a missing gate', async () => {
    for (const email of ['nadia@', 'nadia@gmail', 'na dia@gmail.com', 'a@b@c.id', 'nadia@.id', 'nadia@gmail.']) {
      await expect(request(email)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    }
    await expect(auth.requestOtp({ email: 'a@b.id', locale: 'id' }, '', gate)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(
      auth.requestOtp({ email: 'a@b.id', locale: 'id' }, 'device', { admissionToken: 'adm' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(auth.verifyOtp({ challengeId: 'x', code: '123456' }, '')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('accepts an empty Turnstile token, as the web sends with Turnstile off', async () => {
    await expect(
      auth.requestOtp({ email: 'off@example.com', locale: 'id' }, 'device', { turnstileToken: '' }),
    ).resolves.toMatchObject({ status: 202 });
  });

  it('refreshes the last session until logout, and guards the profile', async () => {
    const { data } = await request(MOCK_KNOWN_EMAIL);
    await auth.verifyOtp({ challengeId: data.challengeId, code: MOCK_OTP_CODE }, 'device');
    await expect(auth.refreshSession('device')).resolves.toMatchObject({ data: { isNewAccount: false } });
    await auth.logout();
    await expect(auth.refreshSession('device')).rejects.toMatchObject({ status: 401 });
    await expect(account.getMe()).rejects.toMatchObject({ status: 401 });
    await expect(account.updateProfile({ fullName: 'X' })).rejects.toMatchObject({ status: 401 });
  });

  it('follows the shared failure scenarios', async () => {
    scenario = 'error';
    await expect(request('a@b.id')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    await expect(auth.verifyOtp({ challengeId: 'x', code: '1' }, 'd')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
    await expect(auth.refreshSession('d')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    await expect(account.getMe()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    await expect(account.updateProfile({ fullName: 'X' })).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
