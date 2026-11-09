import type { User } from '@core/entities/auth/auth.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import { errorCodeOf, withDeviceToken } from '@core/use_case/device/with-device-token';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export interface VerifySignInCodeInput {
  challengeId: string;
  code: string;
}

export type VerifySignInCodeResult =
  | { kind: 'signed-in'; isNewAccount: boolean; user: User }
  | { kind: 'wrong-code'; attemptsLeft: number }
  /** 10 minutes passed, or the code was already used: request a new one. */
  | { kind: 'expired' }
  /** Five wrong codes: request a new one. */
  | { kind: 'locked' };

export interface VerifySignInCodeUseCaseInterface {
  execute: (input: VerifySignInCodeInput) => Promise<VerifySignInCodeResult>;
}

type Deps = Pick<AwilixRegistry, 'authService' | 'deviceService' | 'deviceTokenStore' | 'turnstile' | 'tokenStore'>;

function attemptsLeftOf(error: unknown): number {
  const value = ((error as HttpError).data as { attemptsLeft?: unknown } | undefined)?.attemptsLeft;
  return typeof value === 'number' && value >= 0 ? value : 0;
}

/** ADR-0006: the code is bound to the device and the challenge; a right code signs in or creates the account. */
export const VerifySignInCodeUseCase = ({
  authService,
  deviceService,
  deviceTokenStore,
  turnstile,
  tokenStore,
}: Deps): VerifySignInCodeUseCaseInterface => ({
  execute: async ({ challengeId, code }) => {
    try {
      const { data } = await withDeviceToken({ deviceService, deviceTokenStore, turnstile }, (deviceToken) =>
        authService.verifyOtp({ challengeId, code }, deviceToken),
      );
      tokenStore.setAccessToken(data.accessToken);
      return { kind: 'signed-in', isNewAccount: data.isNewAccount, user: data.user };
    } catch (error) {
      switch (errorCodeOf(error)) {
        case 'WRONG_CODE':
          return { kind: 'wrong-code', attemptsLeft: attemptsLeftOf(error) };
        case 'CHALLENGE_EXPIRED':
          return { kind: 'expired' };
        case 'CHALLENGE_LOCKED':
          return { kind: 'locked' };
        default:
          throw error;
      }
    }
  },
});
