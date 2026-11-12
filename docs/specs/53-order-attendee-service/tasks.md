# Implementation Plan: Order attendee service

## Overview

Add the `validateAttendee` entity types, `bookingService.validateAttendee` (`POST /events/{eventId}/attendees/validate`
with `X-Admission-Token`), and a deterministic MSW mock (last 4 NIK digits pick the outcome, ~600 ms latency, new
`dukcapil_down` scenario), with tests. No new DI key. Writer: service-writer. Spec 54 consumes it.

## Tasks

- [x] 1. Add `ValidateAttendeeRequest` and `ValidateAttendeeResponse` to `src/core/entities/booking/booking.entity.ts` (all fields required, TSDoc for `fieldIndex` 0–2 and the 16-digit NIK) [Requirement 1]
- [x] 2. Add `validateAttendee(eventId, admissionToken, body)` to `src/core/services/booking.service.ts` (`coreHttp.post<ValidateAttendeeResponse, ValidateAttendeeRequest>`, encoded id, admission header) and its cases in `src/core/services/__tests__/booking.service.test.ts`; add `validateAttendee: vi.fn()` to any typed `bookingService` fake that `tsc` flags [Requirement 2, Requirement 5]
- [x] 3. Move `problemWith` to `src/infrastructure/mocks/handlers/shared.ts` (optional headers) and import it in `auth.handlers.ts`; add `dukcapil_down` with its comment to `MOCK_SCENARIOS` in `src/infrastructure/mocks/scenario.ts` [Requirement 3, Requirement 4]
- [x] 4. Add the `POST /events/:eventId/attendees/validate` handler to `src/infrastructure/mocks/handlers/booking.handlers.ts` in the design's row order, with `MOCK_DUKCAPIL_LATENCY_MS`, `MOCK_NIK_SUFFIX`, `MOCK_RETRY_AFTER_S` exported and a per-factory token counter [Requirement 3, Requirement 4]
- [x] 5. Tests: every handler-table row, masking, `expiresAt`, `Retry-After` header (raw `fetch`) and `retryAfter` body, no NIK/name echoed, distinct tokens in `booking.handlers.test.ts`; `dukcapil_down` in `scenario.test.ts` [Requirement 3, Requirement 4, Requirement 5]
- [x] 6. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 3], [2, 4], [5], [6]] }
```

## Notes

- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage ≥ 85% on the changed files.
- The service takes the token as a parameter; only the controller reads `admissionStore` (spec 55) and only the use case
  decides what a missing token means (spec 54).
- The mock does not model `DUPLICATE_NIK` per order or the 3-per-minute counter; the client catches repeats (spec 54)
  and the `6666` suffix shows the 429 state.
- `Retry-After` reaches the client only through the body's `retryAfter` (the adapter drops headers); see spec 54 open
  question.
- Commit: `feat(order): [FR-15-W1] add the validate attendee call and its mock`.
