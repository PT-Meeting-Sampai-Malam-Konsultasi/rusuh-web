# Requirements Document

## Introduction

Data layer for FR-15-W1 (rusuh-web#15, "Web: Order: NIK field checks and Dukcapil states"; parent FR-15 "Sistem
memvalidasi format NIK (16 digit) dan mencegah penggunaan NIK yang sama untuk melampaui kuota 3 tiket pada event yang
sama."; aanwijzing T-09: 1 NIK = 1 seat per event, one NIK per ticket). Adds the `validateAttendee` request/response
types, `bookingService.validateAttendee` (`POST /events/{eventId}/attendees/validate`, bearer + `X-Admission-Token`,
NFR-07) and a deterministic MSW mock so QA can reach every Dukcapil state locally. Sources:
`../rusuh-documentation/api/openapi.yaml` (`validateAttendee`, `ErrorCode`, `TooManyRequests`), ADR-0007,
`architecture/customer-journey.md` (F8–F11, F17–F19, F23; sequence "Each attendee (1-3)"). First spec of FR-15-W1; spec 54
classifies the outcomes, spec 55 drives the fields, spec 56 renders them.

Out of scope: the hold (`createBooking`, `ATTENDEE_NOT_VALIDATED`, `ACCOUNT_HAS_ACTIVE_BOOKING`), a per-order duplicate
model in the mock (the client catches repeats, spec 54), the 3-per-minute counter in the mock (only a fixed NIK answers
429).

## Glossary

| Term             | Definition                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Attendee         | The person a ticket is for: KTP name + 16-digit NIK (ADR-0007); need not be the buyer (N-2)                           |
| fieldIndex       | 0-based position of the ticket in the order (0–2); the server rate-limits per field of each order (C-6)               |
| Validation token | Short-lived token from `validateAttendee` the hold will require per attendee (FR-16+, not used yet)                   |
| nikMasked        | The server's masked NIK (`************1234`); stored, not displayed (the page masks with `maskNik`, first 4 + last 4) |
| Dukcapil mock    | The population-registry check the core service calls with NIK + name (2 s timeout, circuit breaker)                   |
| Mock rule        | The NIK's last 4 digits pick the mock outcome (Data Models table)                                                     |

## Requirements

### Requirement 1: Attendee entities

**User Story:**

AS a web developer
I WANT typed request and response shapes for `validateAttendee`
SO THAT the use case and the later hold share one contract

#### Acceptance Criteria

- SHALL add `ValidateAttendeeRequest { fieldIndex: number; fullName: string; nik: string }` and
  `ValidateAttendeeResponse { validationToken: string; nikMasked: string; expiresAt: string }` to
  `src/core/entities/booking/booking.entity.ts`
- SHALL mark every field required (all are `required` in the contract)
- SHALL document `fieldIndex` as 0–2 and `nik` as 16 digits (`^[0-9]{16}$`) in TSDoc, without runtime checks
- SHALL NOT add runtime code to the entity file

### Requirement 2: validateAttendee service call

**User Story:**

AS a use case
I WANT `bookingService.validateAttendee(eventId, admissionToken, body)`
SO THAT I can check one ticket holder against Dukcapil through DI

#### Acceptance Criteria

- SHALL call `coreHttp.post<ValidateAttendeeResponse, ValidateAttendeeRequest>('events/{id}/attendees/validate', body,
{ headers: { 'X-Admission-Token': admissionToken } })` with the event id passed through `encodeURIComponent`
- SHALL send the body exactly as given (no trimming, no digit stripping: that is the use case's job)
- SHALL return `HttpResponse<ValidateAttendeeResponse>`
- WHEN `coreHttp` rejects (`ADMISSION_INVALID`, `NIK_INVALID`, `VALIDATION_FAILED`, `NIK_SEAT_TAKEN`, `DUPLICATE_NIK`,
  `RATE_LIMITED`, `DUKCAPIL_UNAVAILABLE`, `UNAUTHORIZED`, transport codes) THEN the same error SHALL reach the caller
  unchanged
- SHALL NOT catch, log or transform; SHALL NOT read the admission store
- SHALL NOT change the DI registration (`bookingService` is already registered) or add an `AwilixRegistry` key

### Requirement 3: Deterministic mock outcomes

**User Story:**

AS QA without a backend
I WANT the NIK's last digits to pick the Dukcapil answer
SO THAT I can see every field state on `/order` on demand

#### Acceptance Criteria

- SHALL answer `POST {core}/events/:eventId/attendees/validate` in `src/infrastructure/mocks/handlers/booking.handlers.ts`
- SHALL wait about 600 ms (`delay(MOCK_DUKCAPIL_LATENCY_MS)`) before answering a valid-looking request, so "checking"
  is visible
- WHEN the body's NIK ends in `9999` THEN SHALL answer 422 `NIK_INVALID`
- WHEN it ends in `8888` THEN SHALL answer 409 `NIK_SEAT_TAKEN`
- WHEN it ends in `7777` THEN SHALL answer 503 `DUKCAPIL_UNAVAILABLE`
- WHEN it ends in `6666` THEN SHALL answer 429 `RATE_LIMITED` with header `Retry-After: 60` and `retryAfter: 60` in the
  problem body
- OTHERWISE SHALL answer 200 with `validationToken` (opaque, `mock-attendee-<fieldIndex>-<n>`), `nikMasked` =
  `'************' + last 4`, `expiresAt` = mock now + 5 minutes
- WHEN the NIK is not 16 digits THEN SHALL answer 422 `NIK_INVALID` (contract: "format")
- WHEN `fullName` is missing or blank, or `fieldIndex` is not an integer 0–2, or the body is not JSON THEN SHALL answer
  422 `VALIDATION_FAILED`
- SHALL NOT model `DUPLICATE_NIK` per order and SHALL NOT count attempts per field (documented in the handler)
- SHALL NOT echo the NIK or the name in any problem `title` or `detail`

### Requirement 4: Admission and scenarios in the mock

**User Story:**

AS a developer
I WANT the validate mock to honour the same admission rule and scenarios as the categories mock
SO THAT the redirect and outage states can be reached with `?mock=<scenario>`

#### Acceptance Criteria

- WHEN the `X-Admission-Token` header is missing or empty, the event is unknown, or the scenario is
  `admission_invalid` THEN SHALL answer 403 `ADMISSION_INVALID`
- SHALL honour `slow`, `error` and `offline` through `failure()` first
- SHALL add the scenario `dukcapil_down` to `MOCK_SCENARIOS` with a comment; under it every validate SHALL answer 503
  `DUKCAPIL_UNAVAILABLE` (after the latency), and every other handler SHALL behave as under `ok`
- SHALL keep the categories handler unchanged

### Requirement 5: Tests

**User Story:**

AS a developer
I WANT the service and the mock pinned by tests
SO THAT the use case and controller specs can rely on them

#### Acceptance Criteria

- SHALL test the service with a mocked `coreHttp`: method, path, encoding, header, body, error propagation
- SHALL test the handler through the real HTTP adapter + `BookingService` (node env), one case per Data Models row and
  per admission/scenario rule, including the `Retry-After` header and the `retryAfter` body field
- SHALL test that `dukcapil_down` resolves from the URL in `scenario.test.ts`
- SHALL keep coverage ≥ 85% on the changed files
