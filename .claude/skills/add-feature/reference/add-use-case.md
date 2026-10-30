# Add a use case

Pure business logic. Delegate to `use-case-writer`. Skip this layer when the use-case rule's table says so.

## Steps

1. `src/core/use_case/{domain}/{action}.use-case.ts`: result union, interface, factory.
2. `src/core/use_case/{domain}/__tests__/{action}.use-case.test.ts`: every branch + error propagation.
3. Register in `services.registry.ts` as `.singleton()`; add to `AwilixRegistry`.

## Template

```ts
// src/core/use_case/booking/validate-attendee.use-case.ts
import type { HttpError } from '@core/protocols/http.protocol';
import type { AttendeeInput } from '@core/entities/booking/booking.entity';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export type ValidateAttendeeResult =
  | { kind: 'valid'; validationToken: string; nikMasked: string }
  | { kind: 'invalid'; reason: 'NIK_FORMAT' | 'NIK_INVALID' | 'DUPLICATE_NIK' | 'NIK_SEAT_TAKEN' }
  | { kind: 'retry-later'; reason: 'RATE_LIMITED' | 'DUKCAPIL_UNAVAILABLE' };

export interface ValidateAttendeeUseCaseInterface {
  execute: (eventId: string, admissionToken: string, input: AttendeeInput, otherNiks: string[]) =>
    Promise<ValidateAttendeeResult>;
}

const INVALID = ['NIK_INVALID', 'DUPLICATE_NIK', 'NIK_SEAT_TAKEN'] as const;
const LATER = ['RATE_LIMITED', 'DUKCAPIL_UNAVAILABLE'] as const;

export const ValidateAttendeeUseCase = ({
  bookingService,
}: Pick<AwilixRegistry, 'bookingService'>): ValidateAttendeeUseCaseInterface => ({
  execute: async (eventId, admissionToken, input, otherNiks) => {
    const nik = input.nik.replace(/\D/g, '');
    if (nik.length !== 16) return { kind: 'invalid', reason: 'NIK_FORMAT' };
    if (otherNiks.includes(nik)) return { kind: 'invalid', reason: 'DUPLICATE_NIK' };
    try {
      const res = await bookingService.validateAttendee(eventId, admissionToken, { ...input, nik });
      return { kind: 'valid', validationToken: res.data.validationToken, nikMasked: res.data.nikMasked };
    } catch (e) {
      const code = (e as HttpError).code;
      if ((INVALID as readonly string[]).includes(code)) return { kind: 'invalid', reason: code as typeof INVALID[number] };
      if ((LATER as readonly string[]).includes(code)) return { kind: 'retry-later', reason: code as typeof LATER[number] };
      throw e;
    }
  },
});
```

## Test template

```ts
import { describe, expect, it, vi } from 'vitest';
import { ValidateAttendeeUseCase } from '../validate-attendee.use-case';

describe('ValidateAttendeeUseCase', () => {
  const bookingService = { validateAttendee: vi.fn() };
  const useCase = ValidateAttendeeUseCase({ bookingService } as never);
  const input = { fieldIndex: 0, fullName: 'Nadia Saputri', nik: '3174 0552 0396 0004' };

  it('rejects a NIK that is not 16 digits without calling the API', async () => {
    await expect(useCase.execute('e', 'a', { ...input, nik: '123' }, [])).resolves.toEqual({ kind: 'invalid', reason: 'NIK_FORMAT' });
    expect(bookingService.validateAttendee).not.toHaveBeenCalled();
  });

  it('classifies NIK_SEAT_TAKEN', async () => {
    bookingService.validateAttendee.mockRejectedValue({ status: 409, code: 'NIK_SEAT_TAKEN' });
    await expect(useCase.execute('e', 'a', input, [])).resolves.toEqual({ kind: 'invalid', reason: 'NIK_SEAT_TAKEN' });
  });

  it('lets unexpected errors propagate', async () => {
    bookingService.validateAttendee.mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' });
    await expect(useCase.execute('e', 'a', input, [])).rejects.toMatchObject({ status: 500 });
  });
});
```
