# Implementation Plan: Payment expired (use case)

## Overview

Widen `payBookingUseCase`'s inactive outcome to `InactiveOutcome { refund, reason, eventId, ticketCount }`. Every
inactive path (`settle` for `load` / `pay`, dead steps in `checkStatus`) goes through one helper that reads the booking
once with `bookingService.getBooking`, classifies expired vs other on server times, and degrades to `eventId: null,
ticketCount: null` when that read fails (401 excepted). Writer: use-case-writer. Spec 82 consumes it in the same PR.

## Tasks

- [x] 1. In `src/core/use_case/payment/pay-booking.use-case.ts`: export `InactiveReason` and `InactiveOutcome`, use it in `PaymentPageResult`, `PayResult` and `PaymentStep`, add `bookingService` to the deps `Pick`, and update the `load` / `pay` / `checkStatus` docs with the call budget [Requirement 1, Requirement 3, Requirement 4]
- [x] 2. In the same file: the module-scope classification (`EXPIRED_BY_TIME`, refund / expired / ticket count from Status + Booking) and the `endedOutcome(bookingId, status)` helper with its single `getBooking` call (401 re-thrown, other failures → nulls) [Requirement 1, Requirement 2]
- [x] 3. In the same file: route `settle`'s non-PAID branch and `checkStatus`'s dead steps through `endedOutcome`; leave every other branch unchanged [Requirement 1, Requirement 2, Requirement 3, Requirement 4]
- [x] 4. In `src/core/use_case/payment/__tests__/pay-booking.use-case.test.ts`: `bookingService` mock and `booking()` fixture; widen existing inactive expectations; add `describe('inactive outcome (FR-23-W1)')` per the Testing Strategy (rows × methods, call budget, 401 vs other failures, fake clock, propagation) [Requirement 1, Requirement 2, Requirement 3, Requirement 4]
- [x] 5. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2], [3], [4], [5]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run`; coverage ≥ 85%. Tasks 1–3 edit one file in sequence. `tsc` passes only
  with spec 82's controller changes (same PR).
- No service, entity or DI change: `bookingService` is registered; `PayBookingUseCase` stays a singleton.
- Commit: `feat(payment): [FR-23-W1] tell an expired order from a cancelled one`.
