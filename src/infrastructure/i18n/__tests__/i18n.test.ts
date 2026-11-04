import { describe, expect, it } from 'vitest';

import en from '@translation/locale/en.json';
import id from '@translation/locale/id.json';

import i18n, { LOCALES } from '../index';

// Error codes from rusuh-documentation/api/openapi.yaml (ErrorCode) plus the HTTP adapter's transport codes.
const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'INTERNAL_ERROR',
  'VERIFICATION_UNAVAILABLE',
  'UNAUTHORIZED',
  'ADMISSION_INVALID',
  'NOT_FOUND',
  'RATE_LIMITED',
  'QUEUE_CLOSED',
  'NOT_YET',
  'FULL',
  'MISSED',
  'EXPIRED',
  'NO_STOCK',
  'TOO_FAR',
  'STREAM_FULL',
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
  'NETWORK_ERROR',
  'TIMEOUT',
  'UNKNOWN_ERROR',
];

describe('translations', () => {
  it('id and en have exactly the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(id).sort());
  });

  it('has a message for every API error code', () => {
    const missing = API_ERROR_CODES.map((c) => `error_${c.toLowerCase()}`).filter((k) => !(k in id));
    expect(missing).toEqual([]);
  });

  it('uses flat snake_case keys with non-empty values', () => {
    for (const [k, v] of Object.entries(id)) {
      expect(k).toMatch(/^[a-z0-9_]+$/);
      expect(v).not.toBe('');
    }
  });
});

describe('i18n instance', () => {
  it('defaults to Bahasa Indonesia and switches to English', async () => {
    expect(LOCALES).toEqual(['id', 'en']);
    expect(i18n.language).toBe('id');
    expect(i18n.t('action_retry')).toBe('Coba lagi');
    await i18n.changeLanguage('en');
    expect(i18n.t('action_retry')).toBe('Try again');
    await i18n.changeLanguage('id');
  });
});
