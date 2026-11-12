import type { ValidateAttendeeRequest } from '@core/entities/booking/booking.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import { errorCodeOf } from '@core/use_case/device/with-device-token';
import { retryAfterOf } from '@core/use_case/shared/retry-after';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

/** A KTP NIK has 16 digits (openapi `^[0-9]{16}$`). */
export const NIK_LENGTH = 16;

export type NikCheck =
  | { kind: 'empty' }
  /** Length is not 16 (fewer while typing, or more). */
  | { kind: 'incomplete' }
  /** 16 digits that fail the lenient structure rule. */
  | { kind: 'invalid-structure' }
  /** Same digits as an earlier ticket; ticketIndex is the earliest one, 1-based ("Tiket 1"). */
  | { kind: 'duplicate'; ticketIndex: number }
  | { kind: 'ok' };

export interface ValidateAttendeeInput {
  eventId: string;
  /** From the admission store; null when the tab has no live turn. */
  admissionToken: string | null;
  /** slot index − 1: 0–2. */
  fieldIndex: number;
  /** Trimmed before sending. */
  fullName: string;
  /** Digits only, 16 long (the controller calls only after checkNik → ok). Never logged. */
  nik: string;
}

export type ValidateAttendeeResult =
  | { kind: 'valid'; validationToken: string; nikMasked: string; expiresAt: string }
  /** 422 NIK_INVALID / VALIDATION_FAILED: format, or Dukcapil says name and NIK do not match. */
  | { kind: 'nik-invalid' }
  /** 409 NIK_SEAT_TAKEN: this NIK already holds a seat for the event (ADR-0007, D-3). */
  | { kind: 'seat-taken' }
  /** 409 DUPLICATE_NIK: repeated in this order (server view). */
  | { kind: 'duplicate' }
  /** 429: 3 attempts per minute on this field (C-6) or account/device/IP limits. */
  | { kind: 'rate-limited'; retryAfterSeconds: number | null }
  /** Dukcapil down / 5xx / network / timeout, after one retry. */
  | { kind: 'unavailable' }
  /** No token, or 403 ADMISSION_INVALID: back to the waiting room. */
  | { kind: 'admission-invalid' };

export interface ValidateAttendeeUseCaseInterface {
  /**
   * Client-side NIK check (customer journey F6). Lenient: the server re-checks format and structure and is the
   * authority. `earlierNiks` are the digits of the tickets before this one, in slot order.
   */
  checkNik: (digits: string, earlierNiks: readonly string[]) => NikCheck;
  /** Server check of one ticket holder; at most 2 calls (one retry on a transient failure). */
  execute: (input: ValidateAttendeeInput) => Promise<ValidateAttendeeResult>;
}

const NIK_INVALID = new Set(['NIK_INVALID', 'VALIDATION_FAILED']);
const RATE_LIMITED = new Set(['RATE_LIMITED', 'TOO_MANY_REQUESTS']);
const TRANSIENT_CODES = new Set(['DUKCAPIL_UNAVAILABLE', 'NETWORK_ERROR', 'TIMEOUT']);
const DIGITS_ONLY = /^\d{16}$/;

/** Two digits at 1-based position `from` as a number. */
const pairAt = (digits: string, from: number): number => Number(digits.slice(from - 1, from + 1));

/**
 * Lenient KTP layout PP-KK-CC-DDMMYY-SSSS: province 11–99, day 01–31 or 41–71 (women +40), month 01–12,
 * serial ≠ 0000. Regency/district codes, the year, the calendar validity of the day and checksums are not checked,
 * so this only rejects a NIK the server would reject too; the server re-checks and is the authority.
 */
const hasKtpStructure = (digits: string): boolean => {
  const province = pairAt(digits, 1);
  const day = pairAt(digits, 7);
  const month = pairAt(digits, 9);
  const serial = digits.slice(12, 16);
  const dayOk = (day >= 1 && day <= 31) || (day >= 41 && day <= 71);
  return province >= 11 && dayOk && month >= 1 && month <= 12 && serial !== '0000';
};

const isTransient = (error: unknown): boolean =>
  TRANSIENT_CODES.has(errorCodeOf(error) ?? '') || ((error as HttpError | null)?.status ?? 0) >= 500;

const checkNik = (digits: string, earlierNiks: readonly string[]): NikCheck => {
  if (digits === '') return { kind: 'empty' };
  if (digits.length !== NIK_LENGTH) return { kind: 'incomplete' };
  const earlier = earlierNiks.indexOf(digits);
  if (earlier >= 0) return { kind: 'duplicate', ticketIndex: earlier + 1 };
  if (!DIGITS_ONLY.test(digits) || !hasKtpStructure(digits)) return { kind: 'invalid-structure' };
  return { kind: 'ok' };
};

/** NIK rules of FR-15-W1: the local check and one classified server check (customer journey F6–F11). */
export const ValidateAttendeeUseCase = ({
  bookingService,
}: Pick<AwilixRegistry, 'bookingService'>): ValidateAttendeeUseCaseInterface => ({
  checkNik,
  execute: async ({ eventId, admissionToken, fieldIndex, fullName, nik }) => {
    if (!admissionToken) return { kind: 'admission-invalid' };
    const body: ValidateAttendeeRequest = { fieldIndex, fullName: fullName.trim(), nik };
    const call = () => bookingService.validateAttendee(eventId, admissionToken, body);

    try {
      let response;
      try {
        response = await call();
      } catch (error) {
        if (!isTransient(error)) throw error;
        // F10: retry once at once, then a clear message.
        response = await call();
      }
      const { validationToken, nikMasked, expiresAt } = response.data;
      return { kind: 'valid', validationToken, nikMasked, expiresAt };
    } catch (error) {
      const code = errorCodeOf(error) ?? '';
      if (code === 'ADMISSION_INVALID') return { kind: 'admission-invalid' };
      if (NIK_INVALID.has(code)) return { kind: 'nik-invalid' };
      if (code === 'NIK_SEAT_TAKEN') return { kind: 'seat-taken' };
      if (code === 'DUPLICATE_NIK') return { kind: 'duplicate' };
      if (RATE_LIMITED.has(code)) return { kind: 'rate-limited', retryAfterSeconds: retryAfterOf(error) };
      if (isTransient(error)) return { kind: 'unavailable' };
      throw error;
    }
  },
});
