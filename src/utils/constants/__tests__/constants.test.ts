import { describe, expect, it } from 'vitest';

import id from '@translation/locale/id.json';

import { ERROR_CODE_MAP, FALLBACK_ERROR_KEY } from '../error-codes';
import { ROUTES, withQuery } from '../routes';

describe('ERROR_CODE_MAP', () => {
  it('points every code at a translation key that exists', () => {
    for (const key of [...Object.values(ERROR_CODE_MAP), FALLBACK_ERROR_KEY]) expect(id).toHaveProperty(key);
    expect(ERROR_CODE_MAP.NIK_SEAT_TAKEN).toBe('error_nik_seat_taken');
  });
});

describe('routes', () => {
  it('builds paths with search params', () => {
    expect(withQuery(ROUTES.QUEUE, { event: 'evt 1' })).toBe('/queue?event=evt+1');
  });
});
