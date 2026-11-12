import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountService } from '../account.service';
import { AuthService } from '../auth.service';

const coreHttp = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
const body = { email: 'nadia@example.com', locale: 'id' as const };

describe('AuthService', () => {
  const service = AuthService({ coreHttp });

  beforeEach(() => vi.clearAllMocks());

  it('requests a code with the device token and a Turnstile token', async () => {
    const response = { data: { challengeId: 'ch' }, status: 202 };
    coreHttp.post.mockResolvedValue(response);
    await expect(service.requestOtp(body, 'd', { turnstileToken: 'ts' })).resolves.toBe(response);
    expect(coreHttp.post).toHaveBeenCalledWith('auth/otp', body, {
      headers: { 'X-Device-Token': 'd', 'X-Turnstile-Token': 'ts' },
      skipRefresh: true,
    });
  });

  it('sends the queue or admission token instead of Turnstile', async () => {
    coreHttp.post.mockResolvedValue({ data: {}, status: 202 });
    await service.requestOtp(body, 'd', { queueToken: 'q' });
    await service.requestOtp(body, 'd', { admissionToken: 'a' });
    expect(coreHttp.post.mock.calls[0][2].headers).toEqual({ 'X-Device-Token': 'd', 'X-Queue-Token': 'q' });
    expect(coreHttp.post.mock.calls[1][2].headers).toEqual({ 'X-Device-Token': 'd', 'X-Admission-Token': 'a' });
  });

  it('verifies the code with credentials, so the refresh cookie is kept', async () => {
    coreHttp.post.mockResolvedValue({ data: {}, status: 200 });
    await service.verifyOtp({ challengeId: 'ch', code: '123456' }, 'd');
    expect(coreHttp.post).toHaveBeenCalledWith(
      'auth/otp/verify',
      { challengeId: 'ch', code: '123456' },
      { headers: { 'X-Device-Token': 'd' }, skipRefresh: true, withCredentials: true },
    );
  });

  it('refreshes and logs out with credentials and no refresh on 401', async () => {
    coreHttp.post.mockResolvedValue({ data: {}, status: 200 });
    await service.refreshSession('d');
    await service.logout();
    expect(coreHttp.post).toHaveBeenNthCalledWith(1, 'auth/refresh', undefined, {
      headers: { 'X-Device-Token': 'd' },
      skipRefresh: true,
      withCredentials: true,
    });
    expect(coreHttp.post).toHaveBeenNthCalledWith(2, 'auth/logout', undefined, {
      headers: {},
      skipRefresh: true,
      withCredentials: true,
    });
  });

  it('lets the HttpError through unchanged', async () => {
    const error = { status: 409, code: 'WRONG_CODE', message: 'Kode salah' };
    coreHttp.post.mockRejectedValue(error);
    await expect(service.verifyOtp({ challengeId: 'ch', code: '000001' }, 'd')).rejects.toBe(error);
  });
});

describe('AccountService', () => {
  const service = AccountService({ coreHttp });

  beforeEach(() => vi.clearAllMocks());

  it('gets the profile', async () => {
    const response = { data: { userId: 'u' }, status: 200 };
    coreHttp.get.mockResolvedValue(response);
    await expect(service.getMe()).resolves.toBe(response);
    expect(coreHttp.get).toHaveBeenCalledWith('auth/profile');
  });

  it('saves the name and language', async () => {
    coreHttp.put.mockResolvedValue({ data: {}, status: 200 });
    await service.updateProfile({ fullName: 'Nadia Saputri', locale: 'en' });
    expect(coreHttp.put).toHaveBeenCalledWith('auth/profile', { fullName: 'Nadia Saputri', locale: 'en' });
  });
});
