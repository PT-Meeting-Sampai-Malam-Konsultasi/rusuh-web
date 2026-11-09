import { describe, expect, it, vi } from 'vitest';

import { errorCodeOf, withDeviceToken } from '../with-device-token';

const problem = (status: number, code: string) => ({ status, code, message: code });

function deps(stored: string | null) {
  let device = stored;
  return {
    deviceService: {
      registerDevice: vi.fn().mockResolvedValue({ data: { deviceToken: 'new', expiresAt: '' }, status: 201 }),
    },
    deviceTokenStore: {
      get: vi.fn(() => device),
      set: vi.fn((token: string) => {
        device = token;
      }),
      clear: vi.fn(() => {
        device = null;
      }),
    },
    turnstile: { getToken: vi.fn(async (action: string) => `ts-${action}`) },
  };
}

describe('withDeviceToken', () => {
  it('uses the stored token without registering', async () => {
    const d = deps('old');
    const call = vi.fn(async (token: string) => token);
    await expect(withDeviceToken(d, call)).resolves.toBe('old');
    expect(d.deviceService.registerDevice).not.toHaveBeenCalled();
  });

  it('registers and stores a token when there is none', async () => {
    const d = deps(null);
    await expect(withDeviceToken(d, async (token) => token)).resolves.toBe('new');
    expect(d.deviceService.registerDevice).toHaveBeenCalledWith('ts-register');
    expect(d.deviceTokenStore.set).toHaveBeenCalledWith('new');
  });

  it('replaces a rejected stored token once', async () => {
    const d = deps('old');
    const call = vi.fn(async (token: string) => {
      if (token === 'old') throw problem(401, 'UNAUTHORIZED');
      return token;
    });
    await expect(withDeviceToken(d, call)).resolves.toBe('new');
    expect(d.deviceTokenStore.clear).toHaveBeenCalled();
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('does not retry a token it just registered, or other errors', async () => {
    const fresh = deps(null);
    await expect(
      withDeviceToken(fresh, async () => {
        throw problem(401, 'UNAUTHORIZED');
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(fresh.deviceService.registerDevice).toHaveBeenCalledTimes(1);

    const stored = deps('old');
    await expect(
      withDeviceToken(stored, async () => {
        throw problem(503, 'INTERNAL_ERROR');
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(stored.deviceTokenStore.clear).not.toHaveBeenCalled();
  });
});

describe('errorCodeOf', () => {
  it('reads the code of an HttpError and ignores anything else', () => {
    expect(errorCodeOf(problem(409, 'WRONG_CODE'))).toBe('WRONG_CODE');
    expect(errorCodeOf('boom')).toBeUndefined();
    expect(errorCodeOf(null)).toBeUndefined();
  });
});
