import type { User } from '@core/entities/auth/auth.entity';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export interface RefreshSessionUseCaseInterface {
  /** The account when a new access token is in the token store; null when the buyer has to sign in again. */
  execute: () => Promise<User | null>;
}

type Deps = Pick<AwilixRegistry, 'authService' | 'deviceTokenStore' | 'tokenStore'>;

/**
 * Called by the core HTTP adapter on a 401 (expired access token). The refresh cookie rotates on every call; any
 * failure (no device, revoked or reused refresh token, network) ends the session in memory, and the caller's
 * request then fails with its own 401.
 */
export const RefreshSessionUseCase = ({
  authService,
  deviceTokenStore,
  tokenStore,
}: Deps): RefreshSessionUseCaseInterface => ({
  execute: async () => {
    const deviceToken = deviceTokenStore.get();
    if (!deviceToken) {
      tokenStore.setAccessToken(null);
      return null;
    }
    try {
      const { data } = await authService.refreshSession(deviceToken);
      tokenStore.setAccessToken(data.accessToken);
      return data.user;
    } catch {
      // Refreshing is best effort: whatever went wrong, the buyer signs in again.
      tokenStore.setAccessToken(null);
      return null;
    }
  },
});
