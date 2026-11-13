import { describe, expect, it, vi } from 'vitest';

import type { ValidateAttendeeInput, ValidateAttendeeResult } from '../validate-attendee.use-case';
import { NIK_LENGTH, ValidateAttendeeUseCase } from '../validate-attendee.use-case';

const A = '3174055203960004';
const B = '3201125203960001';

const problem = (status: number, code: string, data?: unknown) => ({ status, code, message: `${code} message`, data });

const okBody = {
  validationToken: 'vtok_1',
  nikMasked: '************0004',
  expiresAt: '2026-11-12T03:10:00Z',
};
const ok = () => ({ data: okBody, status: 200 });

const input: ValidateAttendeeInput = {
  eventId: 'evt_1',
  admissionToken: 'adm_1',
  fieldIndex: 1,
  fullName: '  Nadia Saputri  ',
  nik: A,
};

const setup = () => {
  const bookingService = {
    getCategories: vi.fn(),
    getBooking: vi.fn(),
    listMyTickets: vi.fn(),
    downloadTickets: vi.fn(),
    validateAttendee: vi.fn(),
    createBooking: vi.fn(),
    enterPayment: vi.fn(),
    checkPaymentStatus: vi.fn(),
    getActiveBooking: vi.fn(),
  };
  const useCase = ValidateAttendeeUseCase({ bookingService });
  return { bookingService, useCase };
};

/** Property 8: nothing but the server's nikMasked may carry the NIK; the name never comes back. */
const expectNoPersonalData = (result: ValidateAttendeeResult) => {
  const json = JSON.stringify(result);
  expect(json).not.toContain(input.nik);
  expect(json).not.toContain('Nadia');
};

/** Deterministic linear congruential generator (no Math.random). */
const seeded = (seed: number) => {
  let state = seed;
  return (max: number) => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state % max;
  };
};
const pad = (n: number, width: number) => String(n).padStart(width, '0');

describe('ValidateAttendeeUseCase.checkNik', () => {
  const { useCase } = setup();

  it('exposes the NIK length', () => {
    expect(NIK_LENGTH).toBe(16);
  });

  it.each([
    [A, 'ok'],
    [B, 'ok'],
    ['3174055203969999', 'ok'],
    ['3174055203968888', 'ok'],
    ['3174055203967777', 'ok'],
    ['3174055203966666', 'ok'],
    ['3201123456780001', 'invalid-structure'],
    ['0974055203960004', 'invalid-structure'],
    ['3174050003960004', 'invalid-structure'],
    ['3174057203960004', 'invalid-structure'],
    ['3174054103960004', 'ok'],
    ['3174055213960004', 'invalid-structure'],
    ['3174055200960004', 'invalid-structure'],
    ['3174055203960000', 'invalid-structure'],
    ['3174053102960004', 'ok'],
  ])('structure of %s is %s', (digits, kind) => {
    expect(useCase.checkNik(digits, [])).toEqual({ kind });
  });

  it.each<[string, readonly string[], unknown]>([
    ['', [A], { kind: 'empty' }],
    ['', [], { kind: 'empty' }],
    ['3174', [A], { kind: 'incomplete' }],
    [`${A}1`, [], { kind: 'incomplete' }],
    [A, [], { kind: 'ok' }],
    [A, [A], { kind: 'duplicate', ticketIndex: 1 }],
    [A, [B, A], { kind: 'duplicate', ticketIndex: 2 }],
    [A, [A, A], { kind: 'duplicate', ticketIndex: 1 }],
    [A, ['', '3174'], { kind: 'ok' }],
    ['3174', ['3174'], { kind: 'incomplete' }],
  ])('checkNik(%j, %j) → %j', (digits, earlier, expected) => {
    expect(useCase.checkNik(digits, earlier)).toEqual(expected);
  });

  it('reports a duplicate before a structure error', () => {
    const bad = '0974055203960004';
    expect(useCase.checkNik(bad, [bad])).toEqual({ kind: 'duplicate', ticketIndex: 1 });
  });

  it('treats a 16-char string with a non-digit as invalid-structure, shorter ones as incomplete', () => {
    expect(useCase.checkNik('31740552039600a4', [])).toEqual({ kind: 'invalid-structure' });
    expect(useCase.checkNik('3174 0552', [])).toEqual({ kind: 'incomplete' });
  });

  it('returns equal results for equal inputs and does not mutate earlierNiks', () => {
    const earlier = Object.freeze([B]);
    expect(useCase.checkNik(A, earlier)).toEqual(useCase.checkNik(A, earlier));
    expect(earlier).toEqual([B]);
  });

  it('accepts every generated NIK inside the structure rule and rejects each part out of range', () => {
    const next = seeded(42);
    for (let i = 0; i < 500; i += 1) {
      const province = 11 + next(89);
      const day = next(2) === 0 ? 1 + next(31) : 41 + next(31);
      const month = 1 + next(12);
      const serial = 1 + next(9999);
      const regency = pad(next(10_000), 4);
      const year = pad(next(100), 2);
      const build = (p: number, d: number, m: number, s: string, r = regency, y = year) =>
        `${pad(p, 2)}${r}${pad(d, 2)}${pad(m, 2)}${y}${s}`;
      const nik = build(province, day, month, pad(serial, 4));

      expect(useCase.checkNik(nik, [])).toEqual({ kind: 'ok' });
      // digits 3–6 and 11–12 never change the result
      expect(
        useCase.checkNik(build(province, day, month, pad(serial, 4), pad(next(10_000), 4), pad(next(100), 2)), []),
      ).toEqual({ kind: 'ok' });

      const badProvince = next(11);
      const badDay = [0, 32 + next(9), 72 + next(28)][next(3)]!;
      const badMonth = next(2) === 0 ? 0 : 13 + next(87);
      expect(useCase.checkNik(build(badProvince, day, month, pad(serial, 4)), [])).toEqual({
        kind: 'invalid-structure',
      });
      expect(useCase.checkNik(build(province, badDay, month, pad(serial, 4)), [])).toEqual({
        kind: 'invalid-structure',
      });
      expect(useCase.checkNik(build(province, day, badMonth, pad(serial, 4)), [])).toEqual({
        kind: 'invalid-structure',
      });
      expect(useCase.checkNik(build(province, day, month, '0000'), [])).toEqual({ kind: 'invalid-structure' });
    }
  });
});

describe('ValidateAttendeeUseCase.execute', () => {
  it.each([null, ''])('returns admission-invalid without a request when the token is %j', async (admissionToken) => {
    const { bookingService, useCase } = setup();
    await expect(useCase.execute({ ...input, admissionToken })).resolves.toEqual({ kind: 'admission-invalid' });
    expect(bookingService.validateAttendee).not.toHaveBeenCalled();
  });

  it('sends the trimmed name, the NIK and field index unchanged, with the token as given', async () => {
    const { bookingService, useCase } = setup();
    bookingService.validateAttendee.mockResolvedValue(ok());
    const result = await useCase.execute(input);
    expect(result).toEqual({ kind: 'valid', ...okBody });
    expect(bookingService.validateAttendee).toHaveBeenCalledTimes(1);
    expect(bookingService.validateAttendee).toHaveBeenCalledWith('evt_1', 'adm_1', {
      fieldIndex: 1,
      fullName: 'Nadia Saputri',
      nik: A,
    });
  });

  it.each<[string, unknown, ValidateAttendeeResult]>([
    ['403 ADMISSION_INVALID', problem(403, 'ADMISSION_INVALID'), { kind: 'admission-invalid' }],
    ['422 NIK_INVALID', problem(422, 'NIK_INVALID'), { kind: 'nik-invalid' }],
    ['422 VALIDATION_FAILED', problem(422, 'VALIDATION_FAILED'), { kind: 'nik-invalid' }],
    ['409 NIK_SEAT_TAKEN', problem(409, 'NIK_SEAT_TAKEN'), { kind: 'seat-taken' }],
    ['409 DUPLICATE_NIK', problem(409, 'DUPLICATE_NIK'), { kind: 'duplicate' }],
    [
      '429 RATE_LIMITED retryAfter 41.2',
      problem(429, 'RATE_LIMITED', { retryAfter: 41.2 }),
      { kind: 'rate-limited', retryAfterSeconds: 42 },
    ],
    [
      '429 RATE_LIMITED retryAfterSeconds 10',
      problem(429, 'RATE_LIMITED', { retryAfterSeconds: 10 }),
      { kind: 'rate-limited', retryAfterSeconds: 10 },
    ],
    [
      '429 TOO_MANY_REQUESTS no body',
      problem(429, 'TOO_MANY_REQUESTS'),
      { kind: 'rate-limited', retryAfterSeconds: null },
    ],
  ])('classifies %s after one call', async (_label, error, expected) => {
    const { bookingService, useCase } = setup();
    bookingService.validateAttendee.mockRejectedValueOnce(error);
    const result = await useCase.execute(input);
    expect(result).toEqual(expected);
    expect(bookingService.validateAttendee).toHaveBeenCalledTimes(1);
    expectNoPersonalData(result);
  });

  it.each<[string, unknown, unknown, ValidateAttendeeResult]>([
    ['503 DUKCAPIL_UNAVAILABLE → 200', problem(503, 'DUKCAPIL_UNAVAILABLE'), null, { kind: 'valid', ...okBody }],
    ['503 → 503', problem(503, 'DUKCAPIL_UNAVAILABLE'), problem(503, 'DUKCAPIL_UNAVAILABLE'), { kind: 'unavailable' }],
    ['NETWORK_ERROR → TIMEOUT', problem(0, 'NETWORK_ERROR'), problem(0, 'TIMEOUT'), { kind: 'unavailable' }],
    [
      '500 INTERNAL_ERROR → 502 HTTP_502',
      problem(500, 'INTERNAL_ERROR'),
      problem(502, 'HTTP_502'),
      { kind: 'unavailable' },
    ],
    [
      '500 INTERNAL_ERROR → 409 NIK_SEAT_TAKEN',
      problem(500, 'INTERNAL_ERROR'),
      problem(409, 'NIK_SEAT_TAKEN'),
      { kind: 'seat-taken' },
    ],
    ['TIMEOUT → 422 NIK_INVALID', problem(0, 'TIMEOUT'), problem(422, 'NIK_INVALID'), { kind: 'nik-invalid' }],
    [
      '503 → 429',
      problem(503, 'DUKCAPIL_UNAVAILABLE'),
      problem(429, 'RATE_LIMITED'),
      { kind: 'rate-limited', retryAfterSeconds: null },
    ],
    [
      '503 → 403',
      problem(503, 'DUKCAPIL_UNAVAILABLE'),
      problem(403, 'ADMISSION_INVALID'),
      { kind: 'admission-invalid' },
    ],
  ])('retries once after a transient failure: %s', async (_label, first, second, expected) => {
    const { bookingService, useCase } = setup();
    bookingService.validateAttendee.mockRejectedValueOnce(first);
    if (second === null) bookingService.validateAttendee.mockResolvedValueOnce(ok());
    else bookingService.validateAttendee.mockRejectedValueOnce(second);

    const result = await useCase.execute(input);
    expect(result).toEqual(expected);
    expect(bookingService.validateAttendee).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = bookingService.validateAttendee.mock.calls;
    expect(secondCall).toEqual(firstCall);
    if (result.kind !== 'valid') expectNoPersonalData(result);
  });

  it('rethrows the second error unchanged when a retry ends in 401', async () => {
    const { bookingService, useCase } = setup();
    const unauthorized = problem(401, 'UNAUTHORIZED');
    bookingService.validateAttendee
      .mockRejectedValueOnce(problem(503, 'DUKCAPIL_UNAVAILABLE'))
      .mockRejectedValueOnce(unauthorized);
    await expect(useCase.execute(input)).rejects.toBe(unauthorized);
    expect(bookingService.validateAttendee).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['401 UNAUTHORIZED', problem(401, 'UNAUTHORIZED')],
    ['404 NOT_FOUND', problem(404, 'NOT_FOUND')],
    ['UNKNOWN_ERROR status 0', problem(0, 'UNKNOWN_ERROR')],
    ['HTTP_418', problem(418, 'HTTP_418')],
    ['a non-HttpError', new Error('boom')],
    ['null', null],
  ])('rethrows %s unchanged without a retry', async (_label, error) => {
    const { bookingService, useCase } = setup();
    bookingService.validateAttendee.mockRejectedValueOnce(error);
    await expect(useCase.execute(input)).rejects.toBe(error);
    expect(bookingService.validateAttendee).toHaveBeenCalledTimes(1);
  });
});
