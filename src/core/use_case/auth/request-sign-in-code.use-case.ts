import type { AccountLocale, OtpGate } from '@core/entities/auth/auth.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import { errorCodeOf, withDeviceToken } from '@core/use_case/device/with-device-token';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export interface RequestSignInCodeInput {
  email: string;
  locale: AccountLocale;
  /** Set when the buyer came from a waiting room: its queue token replaces the Turnstile check. */
  eventId?: string;
}

export type RequestSignInCodeResult =
  | { kind: 'sent'; challengeId: string; email: string; expiresAt: string; resendAfterSeconds: number }
  /** 429: resend cooldown or 3 codes per 10 minutes (ADR-0006). */
  | { kind: 'rate-limited'; retryAfterSeconds: number | null }
  | { kind: 'invalid-email' };

export interface RequestSignInCodeUseCaseInterface {
  execute: (input: RequestSignInCodeInput) => Promise<RequestSignInCodeResult>;
}

type Deps = Pick<
  AwilixRegistry,
  'authService' | 'deviceService' | 'deviceTokenStore' | 'queuePlaceStore' | 'turnstile'
>;

/** The auth service answers with the generic codes; the contract names the specific ones. Both are accepted. */
const RATE_LIMITED = new Set(['RATE_LIMITED', 'TOO_MANY_REQUESTS']);
const INVALID = new Set(['VALIDATION_FAILED', 'BAD_REQUEST']);

function retryAfterOf(error: unknown): number | null {
  const data = (error as HttpError).data as { retryAfter?: unknown; retryAfterSeconds?: unknown } | undefined;
  const value = data?.retryAfterSeconds ?? data?.retryAfter;
  return typeof value === 'number' && value > 0 ? Math.ceil(value) : null;
}

/** ADR-0006: one flow for sign-in and sign-up; the answer is the same whether or not the e-mail has an account. */
export const RequestSignInCodeUseCase = ({
  authService,
  deviceService,
  deviceTokenStore,
  queuePlaceStore,
  turnstile,
}: Deps): RequestSignInCodeUseCaseInterface => ({
  execute: async ({ email, locale, eventId }) => {
    const normalized = email.trim().toLowerCase();
    const queueToken = eventId ? queuePlaceStore.get(eventId)?.queueToken : undefined;

    try {
      const { data } = await withDeviceToken({ deviceService, deviceTokenStore, turnstile }, async (deviceToken) => {
        const gate: OtpGate = queueToken ? { queueToken } : { turnstileToken: await turnstile.getToken('otp') };
        return authService.requestOtp({ email: normalized, locale }, deviceToken, gate);
      });
      return {
        kind: 'sent',
        challengeId: data.challengeId,
        email: normalized,
        expiresAt: data.expiresAt,
        resendAfterSeconds: data.resendAfterSeconds,
      };
    } catch (error) {
      const code = errorCodeOf(error) ?? '';
      if (RATE_LIMITED.has(code)) return { kind: 'rate-limited', retryAfterSeconds: retryAfterOf(error) };
      if (INVALID.has(code)) return { kind: 'invalid-email' };
      throw error;
    }
  },
});
