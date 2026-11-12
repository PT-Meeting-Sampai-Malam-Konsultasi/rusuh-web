# Requirements Document

## Introduction

The business rules behind FR-15-W1 (rusuh-web#15, "Web: Order: NIK field checks and Dukcapil states"; parent FR-15
"Sistem memvalidasi format NIK (16 digit) dan mencegah penggunaan NIK yang sama untuk melampaui kuota 3 tiket pada event
yang sama."; aanwijzing T-09: 1 NIK = 1 seat per event, one NIK per ticket). A new `validateAttendeeUseCase` with two
parts: a pure local `checkNik` (16 digits, KTP structure, not repeated in this order: customer journey F6 → F7) and
`execute`, which calls `bookingService.validateAttendee` (spec 53) and classifies every answer into a typed outcome
(F8–F11, F17/F18 wait message, F19/F23 seat taken; F10 "Retry, then clear message"). Sources: ADR-0007, `openapi.yaml`
`validateAttendee` / `TooManyRequests` / `ErrorCode`, `architecture/customer-journey.md`, HiFi `detail.html` lines
31–35. The server re-checks everything and is the authority; the local check only saves a round trip and an attempt.

Out of scope: the hold (`createBooking`, `ATTENDEE_NOT_VALIDATED`, `ACCOUNT_HAS_ACTIVE_BOOKING`); a client-side
3-per-minute counter (the server enforces C-6; the client shows the 429 wait); expiry of validation tokens (the hold
re-checks with `ATTENDEE_NOT_VALIDATED`).

## Glossary

| Term              | Definition                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| NIK digits        | The field's value as stored by the controller: digits only (`toNikDigits`)                                                                      |
| Structure rule    | Lenient KTP layout check: province 11–99 (digits 1–2), day 01–31 or 41–71 (digits 7–8), month 01–12 (digits 9–10), serial ≠ 0000 (digits 13–16) |
| Earlier NIKs      | The NIK digits of the tickets before this one, in slot order (ticket 1 first)                                                                   |
| Local check       | `checkNik`: `empty` / `incomplete` / `duplicate` / `invalid-structure` / `ok`; no API call                                                      |
| Server check      | `execute`: one `validateAttendee` call (plus at most one retry on a transient failure)                                                          |
| Transient failure | 503 `DUKCAPIL_UNAVAILABLE`, any status ≥ 500, `NETWORK_ERROR`, `TIMEOUT`                                                                        |

## Requirements

### Requirement 1: Local NIK check

**User Story:**

AS a buyer typing a ticket holder's NIK
I WANT obvious mistakes caught before anything is sent
SO THAT I fix them at once and do not spend one of my 3 attempts per minute

#### Acceptance Criteria

- SHALL expose `checkNik(digits, earlierNiks): NikCheck`, pure and synchronous
- WHEN `digits` is `''` THEN SHALL return `{ kind: 'empty' }`
- WHEN `digits` has a length other than 16 THEN SHALL return `{ kind: 'incomplete' }` (also above 16: the message is
  "16 digits")
- WHEN `digits` is 16 long and equals an entry of `earlierNiks` THEN SHALL return `{ kind: 'duplicate', ticketIndex }`
  with `ticketIndex` = 1-based position of the **first** equal entry (the earliest ticket)
- WHEN `digits` is 16 long, not a duplicate, and fails the structure rule THEN SHALL return
  `{ kind: 'invalid-structure' }`
- OTHERWISE SHALL return `{ kind: 'ok' }`
- WHEN `digits` contains a non-digit THEN SHALL return `{ kind: 'invalid-structure' }` if its length is 16, else
  `incomplete` (defensive; the controller only passes digits)
- SHALL NOT compare against later tickets: only the later field of a repeated pair reports `duplicate` (HiFi: ticket 2
  shows "sudah dipakai di Tiket 1", ticket 1 stays valid)

### Requirement 2: Lenient structure rule

**User Story:**

AS a buyer with a real KTP
I WANT the client never to reject a NIK the server accepts
SO THAT the local check can only help, never block me

#### Acceptance Criteria

- SHALL accept a 16-digit NIK when: digits 1–2 are 11–99; digits 7–8 are 01–31 or 41–71; digits 9–10 are 01–12;
  digits 13–16 are not `0000`
- SHALL NOT check digits 3–6 (regency / district), digits 11–12 (year), the calendar validity of the day for the month,
  or any checksum
- SHALL document in TSDoc that the server re-checks format and structure and is the authority
- SHALL accept every QA sample NIK of spec 53 (`3174055203960004` and the `…9999/8888/7777/6666` variants) and the new
  hint example `3201125203960001`

### Requirement 3: Server check outcomes

**User Story:**

AS the controller
I WANT one typed outcome per server answer
SO THAT I map codes to field messages without reading HTTP errors

#### Acceptance Criteria

- SHALL expose `execute({ eventId, admissionToken, fieldIndex, fullName, nik }): Promise<ValidateAttendeeResult>`
- WHEN `admissionToken` is `null` or `''` THEN SHALL return `{ kind: 'admission-invalid' }` without calling the service
- SHALL send `fullName.trim()`, `nik` unchanged and `fieldIndex` unchanged
- WHEN the call succeeds THEN SHALL return `{ kind: 'valid', validationToken, nikMasked, expiresAt }` from the body
- WHEN the error code is `ADMISSION_INVALID` THEN SHALL return `{ kind: 'admission-invalid' }`
- WHEN the code is `NIK_INVALID` or `VALIDATION_FAILED` THEN SHALL return `{ kind: 'nik-invalid' }`
- WHEN the code is `NIK_SEAT_TAKEN` THEN SHALL return `{ kind: 'seat-taken' }`
- WHEN the code is `DUPLICATE_NIK` THEN SHALL return `{ kind: 'duplicate' }`
- WHEN the code is `RATE_LIMITED` or `TOO_MANY_REQUESTS` THEN SHALL return
  `{ kind: 'rate-limited', retryAfterSeconds }`, with `retryAfterSeconds` from the problem body (`retryAfterSeconds` or
  `retryAfter`, a positive number rounded up) or `null`, exactly like `request-sign-in-code`
- WHEN the error is any other code (`UNAUTHORIZED`, `NOT_FOUND`, `UNKNOWN_ERROR`, `HTTP_4xx`, a non-`HttpError`) THEN
  SHALL rethrow it unchanged

### Requirement 4: Retry once, then a clear message

**User Story:**

AS a buyer during a Dukcapil hiccup
I WANT the app to try once more on its own before telling me
SO THAT a single timeout does not stop me (customer journey F10)

#### Acceptance Criteria

- WHEN the first call fails transiently (503 `DUKCAPIL_UNAVAILABLE`, status ≥ 500, `NETWORK_ERROR`, `TIMEOUT`) THEN SHALL
  call once more with the same body
- WHEN the second call fails transiently too THEN SHALL return `{ kind: 'unavailable' }`
- WHEN the second call answers anything else THEN SHALL classify that answer (valid, 409, 422, 429, 403 or rethrow)
- SHALL make at most 2 calls per `execute`
- SHALL NOT wait between the two calls with a timer (no browser or timer API in core; the second call is immediate)

### Requirement 5: Privacy

**User Story:**

AS a ticket holder
I WANT my NIK kept out of logs and messages
SO THAT it is handled as personal data (ADR-0007, UU PDP)

#### Acceptance Criteria

- SHALL NOT log, report or include the NIK or the name in any returned value except the request body and the server's
  `nikMasked`
- SHALL NOT build an `Error` or message containing the NIK; rethrown errors are the service's own objects
- SHALL NOT keep NIKs, names or tokens in module scope

### Requirement 6: Pure, registered, tested

**User Story:**

AS a developer
I WANT the rules in one stateless use case in DI
SO THAT the controller stays free of business logic

#### Acceptance Criteria

- SHALL live in `src/core/use_case/booking/validate-attendee.use-case.ts` with zero React, Next.js, browser or
  infrastructure runtime imports and no module-level mutable state
- SHALL depend only on `bookingService` from `AwilixRegistry`
- SHALL move the `retryAfterOf` helper to `src/core/use_case/shared/retry-after.ts` and import it from both this use case
  and `request-sign-in-code.use-case.ts` (behaviour unchanged)
- SHALL register `validateAttendeeUseCase: asFunction(ValidateAttendeeUseCase).singleton()` in `services.registry.ts`,
  add `ValidateAttendeeUseCaseInterface` to `AwilixRegistry`, and add the key to `KEYS` in `registry.test.ts`
- SHALL have tests for every branch; file coverage ≥ 85%
