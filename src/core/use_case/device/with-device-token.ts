import type { HttpError } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export type DeviceTokenDeps = Pick<AwilixRegistry, 'deviceService' | 'deviceTokenStore' | 'turnstile'>;

/** The stable code of an `HttpError`, or undefined for anything else. */
export const errorCodeOf = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null ? (error as HttpError).code : undefined;

/**
 * Runs `call` with this browser's device token (ADR-0003): the stored one, or a new one from Turnstile +
 * registerDevice. A stored token that is rejected (401) is replaced once; a token registered in this same call and
 * still rejected is a real failure and is not retried.
 */
export async function withDeviceToken<T>(
  { deviceService, deviceTokenStore, turnstile }: DeviceTokenDeps,
  call: (deviceToken: string) => Promise<T>,
): Promise<T> {
  const register = async (): Promise<string> => {
    const { data } = await deviceService.registerDevice(await turnstile.getToken('register'));
    deviceTokenStore.set(data.deviceToken);
    return data.deviceToken;
  };

  const stored = deviceTokenStore.get();
  const deviceToken = stored ?? (await register());
  try {
    return await call(deviceToken);
  } catch (error) {
    if (errorCodeOf(error) !== 'UNAUTHORIZED' || !stored) throw error;
    deviceTokenStore.clear();
    return call(await register());
  }
}
