# Design Document

## Overview

`ValidateAttendeeUseCase` holds every NIK rule of FR-15-W1:

1. **`checkNik(digits, earlierNiks)`**: the client half of customer journey F6 ("NIK 16 digits, structure valid, not
   repeated in this order?"). Pure, synchronous, no service. The controller (spec 55) runs it on every render.
2. **`execute(input)`**: one server check (F8 → F9 → F19 → F11) through `bookingService.validateAttendee` (spec 53),
   one immediate retry on a transient failure (F10 "Retry, then clear message"), and a discriminated union for every
   answer the contract lists.

**Check order in `checkNik`:** `empty` → `incomplete` (length ≠ 16) → `duplicate` → `invalid-structure` → `ok`.
`duplicate` before `invalid-structure` because the page shows `duplicate` immediately while the other two wait for a
blur (spec 55); a repeated NIK is reported the moment it is complete, whatever its structure. The earlier ticket with the
same NIK reports its own outcome (structure error or ok), so the pair is never silent.

**Lenient structure rule.** Customer journey F6 says "structure valid" without defining it. The KTP NIK layout is
PP-KK-CC-DDMMYY-SSSS (province, regency, district, birth date with day + 40 for women, serial). The rule checks only
what is safe across every real NIK: province 11–99, day 01–31 / 41–71, month 01–12, serial ≠ 0000. It ignores
regency/district codes (lists change), the year, day-for-month validity and checksums (there is none), so it can only
reject a NIK the server would also reject. The server re-checks format and structure and is the authority.

**Retry inside the use case (difference from the brief).** The brief puts the single retry in the mutation
(`retryTransientOnce`-like). TanStack's `retry` only sees thrown errors, but this use case returns `unavailable` as a
value (core-use-case rule: never throw for an expected outcome), so a mutation-level retry would never fire. The F10
"Retry, then clear message" step is orchestration, which the use-case rule assigns to core ("Multi-step orchestration
(check → validate → transform → decide)"). The controller mutation uses `retry: false`. Cost: a transient failure uses
two of the field's 3 attempts per minute; the same as a mutation retry would.

**Union names (difference from the rule's example).** `core-use-case.md` sketches `ValidateAttendeeResult` as
`valid | invalid(reason) | retry-later(reason)`. This spec uses one kind per user-visible state (`nik-invalid`,
`seat-taken`, `duplicate`, `rate-limited`, `unavailable`, `admission-invalid`) because each has its own message and
`rate-limited` carries `retryAfterSeconds`. Same principle (codes, not sentences).

## Architecture

```
orderController (spec 55)
  ├─ every render, per ticket:  validateAttendeeUseCase.checkNik(digits, earlierNiks)     pure
  └─ on blur / recheck:         useMutationTanstack → validateAttendeeUseCase.execute(input)
                                   ├─ no token → admission-invalid (no call)
                                   ├─ bookingService.validateAttendee(eventId, token, { fieldIndex, fullName.trim(), nik })
                                   │     transient? → call once more
                                   └─ classify → valid | nik-invalid | seat-taken | duplicate | rate-limited | unavailable
                                                 | admission-invalid | rethrow
```

API operation: `validateAttendee` `POST /events/{eventId}/attendees/validate` (spec 53).

Files:

| File                                                                     | Change                             |
| ------------------------------------------------------------------------ | ---------------------------------- |
| `src/core/use_case/booking/validate-attendee.use-case.ts`                | new                                |
| `src/core/use_case/booking/__tests__/validate-attendee.use-case.test.ts` | new                                |
| `src/core/use_case/shared/retry-after.ts`                                | new (moved `retryAfterOf`)         |
| `src/core/use_case/auth/request-sign-in-code.use-case.ts`                | import `retryAfterOf` from shared  |
| `src/infrastructure/di/services.registry.ts`                             | register `validateAttendeeUseCase` |
| `src/infrastructure/di/registry.types.ts`                                | add `validateAttendeeUseCase`      |
| `src/infrastructure/di/__tests__/registry.test.ts`                       | add the key to `KEYS`              |

## Components and Interfaces

```ts
// src/core/use_case/shared/retry-after.ts
import type { HttpError } from '@core/protocols/http.protocol';

/** Seconds to wait from a 429 problem body (`retryAfterSeconds` or `retryAfter`), rounded up; null when absent. */
export function retryAfterOf(error: unknown): number | null;
// body unchanged from request-sign-in-code.use-case.ts
```

```ts
// src/core/use_case/booking/validate-attendee.use-case.ts
import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import { errorCodeOf } from '@core/use_case/device/with-device-token';
import { retryAfterOf } from '@core/use_case/shared/retry-after';

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

export const ValidateAttendeeUseCase = ({
  bookingService,
}: Pick<AwilixRegistry, 'bookingService'>): ValidateAttendeeUseCaseInterface;
```

Private module-scope constants and pure helpers (not exported):

```ts
const NIK_INVALID = new Set(['NIK_INVALID', 'VALIDATION_FAILED']);
const RATE_LIMITED = new Set(['RATE_LIMITED', 'TOO_MANY_REQUESTS']);
const TRANSIENT_CODES = new Set(['DUKCAPIL_UNAVAILABLE', 'NETWORK_ERROR', 'TIMEOUT']);

/** Two digits at 1-based position `from` as a number. */
const pairAt = (digits: string, from: number): number => Number(digits.slice(from - 1, from + 1));

/** Province 11–99, day 01–31 or 41–71 (women +40), month 01–12, serial ≠ 0000. */
const hasKtpStructure = (digits: string): boolean => { … };

const isTransient = (error: unknown): boolean =>
  TRANSIENT_CODES.has(errorCodeOf(error) ?? '') || ((error as HttpError | null)?.status ?? 0) >= 500;
```

Behaviour:

- `checkNik(digits, earlierNiks)`: `''` → `empty`; `length !== 16` → `incomplete`;
  `i = earlierNiks.indexOf(digits)`, `i >= 0` → `{ duplicate, ticketIndex: i + 1 }`; `!/^\d{16}$/.test(digits) ||
!hasKtpStructure(digits)` → `invalid-structure`; else `ok`.
- `execute`: no token → `admission-invalid`. `body = { fieldIndex, fullName: fullName.trim(), nik }`. `attempt()` calls
  the service; on a thrown error, if `isTransient` and it is the first call, call again; then classify:
  success → `valid`; `ADMISSION_INVALID` → `admission-invalid`; `NIK_INVALID` set → `nik-invalid`; `NIK_SEAT_TAKEN` →
  `seat-taken`; `DUPLICATE_NIK` → `duplicate`; `RATE_LIMITED` set → `rate-limited` + `retryAfterOf`; transient →
  `unavailable`; else `throw error`.

DI:

```ts
// src/infrastructure/di/registry.types.ts (addition)
import type { ValidateAttendeeUseCaseInterface } from '@core/use_case/booking/validate-attendee.use-case';
  validateAttendeeUseCase: ValidateAttendeeUseCaseInterface;   // in "use cases"

// src/infrastructure/di/services.registry.ts (addition)
    validateAttendeeUseCase: asFunction(ValidateAttendeeUseCase).singleton(),
```

Compile check: `bookingService.validateAttendee` exists after spec 53; `errorCodeOf` is already exported from
`with-device-token.ts` and used by the auth use cases; the factory picks only `bookingService`, which is registered
earlier in the same registry (Awilix PROXY resolves lazily, so order inside `services.registry.ts` does not matter).
`registry.test.ts` `KEYS` gains `'validateAttendeeUseCase'`; key count = registration count.

## Data Models

Structure rule examples:

| NIK                | Positions                                   | Result                         |
| ------------------ | ------------------------------------------- | ------------------------------ |
| `3174055203960004` | prov 31, day 52 (=12 ♀), month 03, ser 0004 | `ok`                           |
| `3201125203960001` | prov 32, day 52, month 03, ser 0001         | `ok` (new hint)                |
| `3201123456780001` | day 34                                      | `invalid-structure` (old hint) |
| `0974055203960004` | prov 09                                     | `invalid-structure`            |
| `3174050003960004` | day 00                                      | `invalid-structure`            |
| `3174057203960004` | day 72                                      | `invalid-structure`            |
| `3174054103960004` | day 41 (=01 ♀)                              | `ok`                           |
| `3174055213960004` | month 13                                    | `invalid-structure`            |
| `3174055200960004` | month 00                                    | `invalid-structure`            |
| `3174055203960000` | serial 0000                                 | `invalid-structure`            |
| `3174053102960004` | day 31, month 02 (calendar-invalid)         | `ok` (lenient)                 |

`checkNik` with earlier tickets (`A = 3174055203960004`, `B = 3201125203960001`):

| digits    | earlierNiks    | Result                                |
| --------- | -------------- | ------------------------------------- |
| `''`      | any            | `empty`                               |
| `3174`    | `[A]`          | `incomplete`                          |
| `A + '1'` | `[]`           | `incomplete` (17 digits)              |
| `A`       | `[]`           | `ok`                                  |
| `A`       | `[A]`          | `duplicate`, ticketIndex 1            |
| `A`       | `[B, A]`       | `duplicate`, ticketIndex 2            |
| `A`       | `[A, A]`       | `duplicate`, ticketIndex 1 (earliest) |
| `A`       | `['', '3174']` | `ok`                                  |

`execute` outcomes (first call → second call):

| First answer                                | Second call? | Result                 |
| ------------------------------------------- | ------------ | ---------------------- |
| token `null` / `''`                         | no call      | `admission-invalid`    |
| 200                                         | no           | `valid` (body fields)  |
| 403 `ADMISSION_INVALID`                     | no           | `admission-invalid`    |
| 422 `NIK_INVALID`                           | no           | `nik-invalid`          |
| 422 `VALIDATION_FAILED`                     | no           | `nik-invalid`          |
| 409 `NIK_SEAT_TAKEN`                        | no           | `seat-taken`           |
| 409 `DUPLICATE_NIK`                         | no           | `duplicate`            |
| 429 `RATE_LIMITED` `retryAfter: 41.2`       | no           | `rate-limited`, 42     |
| 429 `TOO_MANY_REQUESTS` no body             | no           | `rate-limited`, `null` |
| 503 `DUKCAPIL_UNAVAILABLE` → 200            | yes          | `valid`                |
| 503 → 503                                   | yes          | `unavailable`          |
| `NETWORK_ERROR` → `TIMEOUT`                 | yes          | `unavailable`          |
| 500 `INTERNAL_ERROR` → 409 `NIK_SEAT_TAKEN` | yes          | `seat-taken`           |
| 503 → 401 `UNAUTHORIZED`                    | yes          | rethrow the 401        |
| 401 `UNAUTHORIZED`                          | no           | rethrow                |
| `UNKNOWN_ERROR` (status 0)                  | no           | rethrow                |

## Layer Constraints

From `.claude/rules/core-use-case.md`:

- `src/core/use_case/{domain}/{action}.use-case.ts`
- Depend only on services, config and other use cases from `AwilixRegistry`
- Zero React, zero Next.js, zero hooks, zero browser APIs
- Multi-step orchestration (check → validate → transform → decide)
- Business rules and validation, for example:
  - order limits: total tickets ≤ `min(maxTicketsPerOrder, reservedUnits)`; one NIK per ticket, all different
- Classifying expected API errors into business outcomes
- React state, TanStack Query, navigation, analytics, `t()`, user-facing strings, loading overlays, popups
- Return **typed discriminated unions**; never throw for an expected business outcome:
- Catch only the specific `HttpError` codes you classify; re-throw everything else for the controller.
- Return codes, never sentences: the controller maps codes to translation keys.
- Stateless; registered as `asFunction(UseCase).singleton()`; interface added to `AwilixRegistry`.
- `src/core/use_case/{domain}/__tests__/{action}.use-case.test.ts`
- Plain object mocks, every business branch, and one test that infrastructure errors propagate.
- Coverage threshold 85%.
- ❌ React or Next.js imports
- ❌ User-facing strings
- ❌ Catching all errors
- ❌ Navigation, analytics or translation calls
- ❌ Module-level mutable state
- ❌ A use case that only forwards one service call
- ❌ Throwing for an expected outcome

From `.claude/rules/scaffold.md`:

- Services and use cases: `asFunction(Factory).singleton()`
- `AwilixRegistry` (`src/infrastructure/di/registry.types.ts`) is the single source of truth. **Every key in it has a
  `container.register()` call** in one of the three registries or a `di/controllers/` file. Awilix resolves at
  runtime, so TypeScript will not catch a missing registration. Count keys vs registrations after every change.

From `CLAUDE.md`:

- NIKs are shown masked after entry and never logged.

## Correctness Properties

- Property 1: for every row of the `checkNik` table the result matches; `checkNik` never reads beyond its arguments and
  returns equal results for equal inputs. **Validates: Requirements 1**
- Property 2: `duplicate.ticketIndex === earlierNiks.indexOf(digits) + 1` and is never reported for an incomplete NIK;
  a NIK never reports a duplicate of a later ticket (the function only receives earlier ones).
  **Validates: Requirements 1**
- Property 3: for every 16-digit string with province 11–99, day in 01–31 ∪ 41–71, month 01–12 and serial ≠ 0000,
  `checkNik(…, [])` is `ok` (seeded loop over generated values, no `Math.random`); flipping any one of those four parts
  out of range gives `invalid-structure`; digits 3–6 and 11–12 never change the result. **Validates: Requirements 2**
- Property 4: every row of the `execute` table returns the stated result; the service receives
  `{ fieldIndex, fullName: fullName.trim(), nik }` and the token as given. **Validates: Requirements 3, 4**
- Property 5: with a `null` or empty token the service is never called. **Validates: Requirements 3**
- Property 6: the service is called at most twice per `execute`, and twice only after a transient first failure.
  **Validates: Requirements 4**
- Property 7: an unclassified error is rethrown as the same object (`toBe`), after one or two calls.
  **Validates: Requirements 3, 6**
- Property 8: no returned value (besides `valid.nikMasked` from the server) contains the input NIK or name
  (`JSON.stringify(result)` does not include them). **Validates: Requirements 5**
- Property 9: `request-sign-in-code` tests still pass after `retryAfterOf` moves (same inputs, same outputs).
  **Validates: Requirements 6**

## Error Handling

| Code / condition                                                                             | Outcome                            |
| -------------------------------------------------------------------------------------------- | ---------------------------------- |
| no admission token                                                                           | `admission-invalid` (no call)      |
| 403 `ADMISSION_INVALID`                                                                      | `admission-invalid`                |
| 422 `NIK_INVALID`, `VALIDATION_FAILED`                                                       | `nik-invalid`                      |
| 409 `NIK_SEAT_TAKEN`                                                                         | `seat-taken`                       |
| 409 `DUPLICATE_NIK`                                                                          | `duplicate`                        |
| 429 `RATE_LIMITED`, `TOO_MANY_REQUESTS`                                                      | `rate-limited` (+ seconds or null) |
| 503 `DUKCAPIL_UNAVAILABLE`, ≥ 500, `NETWORK_ERROR`, `TIMEOUT` (twice)                        | `unavailable`                      |
| 401 `UNAUTHORIZED` (after the adapter's refresh), `UNKNOWN_ERROR`, `HTTP_4xx`, anything else | rethrown for the controller        |

**Open question (contract vs adapter):** the contract sends the wait only as the `Retry-After` header; the HTTP adapter
keeps the problem body in `HttpError.data` and drops headers. This use case reads `data.retryAfterSeconds ?? data.retryAfter`
(as `request-sign-in-code` does), so against the real core it returns `null` unless the core also puts `retryAfter` in
the body. Either the core adds it to the problem body (as the auth endpoints do) or the adapter copies `Retry-After` into
`data`. Until then the controller shows the no-seconds variant.

## Testing Strategy

`src/core/use_case/booking/__tests__/validate-attendee.use-case.test.ts`, plain-object `bookingService` fake with
`validateAttendee: vi.fn()` (and `getCategories: vi.fn()`), problems built as plain `{ status, code, message, data }`
objects like the sign-in tests:

- `checkNik`: `it.each` over both Data Models tables; Property 3 seeded generator; a non-digit 16-char string →
  `invalid-structure`.
- `execute`: `it.each` over the outcomes table (with `mockRejectedValueOnce` / `mockResolvedValueOnce` sequences); body
  and token assertions; call counts (0, 1, 2); `toBe` identity for rethrows; Property 8 on every result.
- `src/core/use_case/auth/__tests__/sign-in.use-case.test.ts`: unchanged, green.
- `src/infrastructure/di/__tests__/registry.test.ts`: `validateAttendeeUseCase` in `KEYS` and resolves.
- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage ≥ 85% on the new file.
