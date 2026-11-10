import { describe, expect, it, vi } from 'vitest';

import { SignOutUseCase } from '../sign-out.use-case';

const setup = () => {
  const deps = {
    authService: { requestOtp: vi.fn(), verifyOtp: vi.fn(), refreshSession: vi.fn(), logout: vi.fn() },
    tokenStore: { getAccessToken: vi.fn(), setAccessToken: vi.fn() },
  };
  return { deps, useCase: SignOutUseCase(deps) };
};

describe('SignOutUseCase', () => {
  it('revokes the session on the server and forgets the access token', async () => {
    const { deps, useCase } = setup();
    deps.authService.logout.mockResolvedValue({ data: undefined, status: 204 });
    await expect(useCase.execute()).resolves.toEqual({ revoked: true });
    expect(deps.tokenStore.setAccessToken).toHaveBeenCalledWith(null);
  });

  it('signs the device out even when the call fails', async () => {
    const { deps, useCase } = setup();
    deps.authService.logout.mockRejectedValue({ status: 0, code: 'NETWORK_ERROR' });
    await expect(useCase.execute()).resolves.toEqual({ revoked: false });
    expect(deps.tokenStore.setAccessToken).toHaveBeenCalledWith(null);
  });
});
