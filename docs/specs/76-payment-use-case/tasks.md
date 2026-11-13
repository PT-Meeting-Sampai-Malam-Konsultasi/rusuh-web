# Implementation Plan: Payment use case

## Overview

Add `PayBookingUseCase` in `src/core/use_case/payment/pay-booking.use-case.ts`: `load` (view + per-ticket lines; a 409
checked against the status to tell paid from inactive), `pay` (reuse the live attempt or `startSnap` with the caller's
key, then `snap.pay`; busy / Snap-unavailable as `retryable`) and `checkStatus` (status → `paid` / `verifying` /
`failed` / `inactive`). Snap outcomes never mean paid. Register it as `payBookingUseCase`. Writer: use-case-writer.
Depends on spec 75; spec 77 calls it.

## Tasks

- [x] 1. Create `src/core/use_case/payment/pay-booking.use-case.ts` with the exported types (`SnapHint`, `PaymentTicketLine`, `PaymentPageResult`, `PayInput`, `PayResult`, `PaymentStep`, `PayBookingUseCaseInterface`) and the private constants and helpers (`stepOf`, `ticketLines`, error predicates) [Requirement 1, Requirement 4]
- [x] 2. Implement `load` with the private `settle` (409 → one status call) and `checkStatus` per the design's first-match order [Requirement 1, Requirement 4]
- [x] 3. Implement `pay`: empty id, reuse vs `startSnap(bookingId, idempotencyKey)`, the start classification, `snap.pay` and the `SNAP_UNAVAILABLE` branch; rethrow the rest [Requirement 2, Requirement 3]
- [x] 4. Register `payBookingUseCase: asFunction(PayBookingUseCase).singleton()` in `src/infrastructure/di/services.registry.ts`, add it to `AwilixRegistry` and to `KEYS` in `src/infrastructure/di/__tests__/registry.test.ts` (plus a resolve check) [Requirement 5]
- [x] 5. Tests in `src/core/use_case/payment/__tests__/pay-booking.use-case.test.ts`: every row of the `load`, `pay` and `checkStatus` tables with exact call lists, rethrow identity, no paid from a Snap outcome, no token or name in results [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5]
- [x] 6. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 3, 4], [5], [6]] }
```

## Notes

- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage ≥ 85% on the new file; key count =
  registration count.
- No automatic retry (error-handling rule). The key and the reusable transaction are inputs: the controller owns the
  attempt and renews the key only after a `failed` step (spec 77).
- `snap` is a protocol dependency (page-registered, spec 75); the use case never touches `window`.
- Commit: `feat(payment): [FR-20-W1] add the pay booking use case`.
