/**
 * API error code → translation key. Codes come from rusuh-documentation/api/openapi.yaml (ErrorCode) plus the HTTP
 * adapter's transport codes. Every key exists in both locale files (checked by the i18n test).
 */
const CODES = [
  'VALIDATION_FAILED',
  'INTERNAL_ERROR',
  'VERIFICATION_UNAVAILABLE',
  'UNAUTHORIZED',
  'ADMISSION_INVALID',
  'ADMISSION_UNAVAILABLE',
  'NOT_FOUND',
  'RATE_LIMITED',
  'QUEUE_CLOSED',
  'NOT_YET',
  'FULL',
  'MISSED',
  'EXPIRED',
  'NO_STOCK',
  'ACCOUNT_HAS_PLACE_ELSEWHERE',
  'WRONG_CODE',
  'CHALLENGE_EXPIRED',
  'CHALLENGE_LOCKED',
  'NIK_INVALID',
  'NIK_SEAT_TAKEN',
  'DUPLICATE_NIK',
  'ATTENDEE_NOT_VALIDATED',
  'QUANTITY_OVER_RESERVATION',
  'DUKCAPIL_UNAVAILABLE',
  'ACCOUNT_HAS_ACTIVE_BOOKING',
  'CATEGORY_SOLD_OUT',
  'BOOKING_NOT_HELD',
  'BOOKING_NOT_PAID',
  'NOT_CANCELLABLE',
  'CODE_INVALID',
  'PAYMENT_PROVIDER_BUSY',
  'SERVICE_UNAVAILABLE',
  // Generic codes the core auth service answers with (alongside the specific ones above).
  'BAD_REQUEST',
  'TOO_MANY_REQUESTS',
  'NETWORK_ERROR',
  // Client code: snap.js could not load or open (blocked, offline, timeout).
  'SNAP_UNAVAILABLE',
  'TIMEOUT',
  'UNKNOWN_ERROR',
] as const;

export type ErrorCode = (typeof CODES)[number];

export const ERROR_CODE_MAP: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(CODES.map((code) => [code, `error_${code.toLowerCase()}`])),
);

/** Key to use when a code is not in the map. */
export const FALLBACK_ERROR_KEY = 'error_unknown_error';
