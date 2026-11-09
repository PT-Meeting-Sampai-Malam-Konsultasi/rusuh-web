// Auth and account types, matching the Apidog "Rusuh Booking Tiket API" (requestOtp, verifyOtp, refreshSession,
// getMe, updateAuthProfile). The account holds no NIK (ADR-0007, D17).

export type AccountLocale = 'id' | 'en';

export interface User {
  userId: string;
  email: string;
  /** Name as on the KTP; empty for a new account until the profile step saves it. */
  fullName?: string;
  locale?: AccountLocale;
}

export interface Session {
  /** 15-minute access JWT; kept in memory only. */
  accessToken: string;
  expiresIn: number;
  /** Mobile only; the web gets a `__Host-rt` cookie. */
  refreshToken?: string;
  isNewAccount: boolean;
  user: User;
}

/** `fullName` is not sent: a new account adds its name on the profile step (`updateProfile`). */
export interface RequestOtpRequest {
  email: string;
  locale: AccountLocale;
}

export interface OtpChallenge {
  challengeId: string;
  /** 10 minutes after the request (ADR-0006). */
  expiresAt: string;
  resendAfterSeconds: number;
}

export interface VerifyOtpRequest {
  challengeId: string;
  /** Six digits. */
  code: string;
}

export interface UpdateProfileRequest {
  fullName: string;
  locale?: AccountLocale;
}

/** `requestOtp` takes one of these instead of a Turnstile check: the waiting room's or the order page's token. */
export type OtpGate = { turnstileToken: string } | { queueToken: string } | { admissionToken: string };
