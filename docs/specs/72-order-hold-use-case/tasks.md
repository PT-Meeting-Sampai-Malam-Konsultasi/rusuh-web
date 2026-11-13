# Implementation Plan: Order hold use case

## Overview

Add `HoldBookingUseCase` in `src/core/use_case/booking/hold-booking.use-case.ts`: `quote` prices the summary (lines,
admin fee once per order, total) and `execute` runs the v1 hold (`createBooking` → `enterPayment`), resumes from a known
`bookingId`, recovers a matching active booking after 409 `ACCOUNT_HAS_ACTIVE_BOOKING`, and classifies every answer
into `HoldBookingResult`. Register it as `holdBookingUseCase`. Writer: use-case-writer. Depends on spec 71; spec 73 calls
it.

## Tasks

- [x] 1. Create `src/core/use_case/booking/hold-booking.use-case.ts` with the exported types (`HoldTicket`, `HoldBookingInput`, `HoldBookingResult`, `PriceQuote`, `PriceQuoteLine`, `QuotableCategory`, `HoldBookingUseCaseInterface`), the private helpers and `quote` per the design [Requirement 1]
- [x] 2. Implement `execute`: the pre-checks, create → enter, `bookingId` resume, the `ACCOUNT_HAS_ACTIVE_BOOKING` recovery with the same-order match, and `classify` in the design's order (rethrow the rest) [Requirement 2, Requirement 3, Requirement 4, Requirement 5]
- [x] 3. Register `holdBookingUseCase: asFunction(HoldBookingUseCase).singleton()` in `src/infrastructure/di/services.registry.ts`, add the key to `AwilixRegistry` in `src/infrastructure/di/registry.types.ts` and to `KEYS` in `src/infrastructure/di/__tests__/registry.test.ts` [Requirement 6]
- [x] 4. Tests in `src/core/use_case/booking/__tests__/hold-booking.use-case.test.ts`: the `quote` table and fee loop, every row of the `execute` table with exact call lists, the body shape, rethrow identity, no token / NIK digits / snap token in any result [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5, Requirement 6]
- [x] 5. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 3], [4], [5]] }
```

## Notes

- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage ≥ 85% on the new file; key count =
  registration count.
- No automatic retry (difference from `validateAttendeeUseCase`): a retry can open a second payment attempt, and the
  error-handling rule leaves retries to the buyer.
- The idempotency key and the known `bookingId` are inputs: the controller owns the attempt (spec 73).
- `nikLast4` is used only for matching and never leaves the function; the full NIK never reaches this use case.
- Commit: `feat(order): [FR-16-W1] add the hold booking use case`.
