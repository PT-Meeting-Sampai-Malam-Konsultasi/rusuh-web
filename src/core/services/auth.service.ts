import type {
  OtpChallenge,
  OtpGate,
  RequestOtpRequest,
  Session,
  VerifyOtpRequest,
} from '@core/entities/auth/auth.entity';
import type { HttpResponse, RequestConfig } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

import { TURNSTILE_TOKEN_HEADER } from './device.service';
import { DEVICE_TOKEN_HEADER } from './queue.service';

export const QUEUE_TOKEN_HEADER = 'X-Queue-Token';
export const ADMISSION_TOKEN_HEADER = 'X-Admission-Token';

export interface AuthServiceInterface {
  /**
   * `POST /auth/otp`: always 202 with a challenge, whether or not the e-mail has an account (ADR-0006).
   * 429 RATE_LIMITED, 400 VALIDATION_FAILED, 401 for a rejected device token.
   */
  requestOtp: (body: RequestOtpRequest, deviceToken: string, gate: OtpGate) => Promise<HttpResponse<OtpChallenge>>;
  /** `POST /auth/otp/verify`: 409 WRONG_CODE (`attemptsLeft`), 410 CHALLENGE_EXPIRED / CHALLENGE_LOCKED. */
  verifyOtp: (body: VerifyOtpRequest, deviceToken: string) => Promise<HttpResponse<Session>>;
  /** `POST /auth/refresh`: the web sends the `__Host-rt` cookie; 401 when it is missing or revoked. */
  refreshSession: (deviceToken: string) => Promise<HttpResponse<Session>>;
  /** `POST /auth/logout`: revokes the token family and clears the cookie. */
  logout: () => Promise<HttpResponse<void>>;
}

const gateHeader = (gate: OtpGate): Record<string, string> => {
  if ('queueToken' in gate) return { [QUEUE_TOKEN_HEADER]: gate.queueToken };
  if ('admissionToken' in gate) return { [ADMISSION_TOKEN_HEADER]: gate.admissionToken };
  return { [TURNSTILE_TOKEN_HEADER]: gate.turnstileToken };
};

/** A 401 from an auth call is the answer itself, never a reason to refresh the session. */
const authCall = (headers: Record<string, string>, withCredentials = false): RequestConfig => ({
  headers,
  skipRefresh: true,
  ...(withCredentials ? { withCredentials } : {}),
});

export const AuthService = ({ coreHttp }: Pick<AwilixRegistry, 'coreHttp'>): AuthServiceInterface => ({
  requestOtp: (body, deviceToken, gate) =>
    coreHttp.post<OtpChallenge, RequestOtpRequest>(
      'auth/otp',
      body,
      authCall({ [DEVICE_TOKEN_HEADER]: deviceToken, ...gateHeader(gate) }),
    ),
  verifyOtp: (body, deviceToken) =>
    coreHttp.post<Session, VerifyOtpRequest>(
      'auth/otp/verify',
      body,
      authCall({ [DEVICE_TOKEN_HEADER]: deviceToken }, true),
    ),
  refreshSession: (deviceToken) =>
    coreHttp.post<Session>('auth/refresh', undefined, authCall({ [DEVICE_TOKEN_HEADER]: deviceToken }, true)),
  logout: () => coreHttp.post<void>('auth/logout', undefined, authCall({}, true)),
});
