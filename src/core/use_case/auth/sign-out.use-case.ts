import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export interface SignOutUseCaseInterface {
  /** `revoked`: the server ended the session too; false when the call failed (the device is signed out anyway). */
  execute: () => Promise<{ revoked: boolean }>;
}

type Deps = Pick<AwilixRegistry, 'authService' | 'tokenStore'>;

/** NFR-07-W3: revoke the session (and its `__Host-rt` cookie), then forget the access token, whatever the answer. */
export const SignOutUseCase = ({ authService, tokenStore }: Deps): SignOutUseCaseInterface => ({
  execute: async () => {
    try {
      await authService.logout();
      return { revoked: true };
    } catch {
      return { revoked: false };
    } finally {
      tokenStore.setAccessToken(null);
    }
  },
});
