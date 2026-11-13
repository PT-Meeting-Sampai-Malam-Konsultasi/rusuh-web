# Implementation Plan: Payment service

## Overview

Add the payment entities (`PaymentStatus`, `SnapTransaction`, `PaymentView`, `StartSnapPaymentRequest`,
`PaymentStatusResponse`), `paymentService` (`getPaymentPage`, `startSnap` with `Idempotency-Key` and no body,
`getPaymentStatus`), the `SnapProtocol` with a lazy snap.js adapter and a mock one, the `SNAP_UNAVAILABLE` client code,
the page-scoped `snap` registration in `di/controllers/payment.ts`, and MSW payment handlers with Snap attempts and five
scenarios so `/payment` can be clicked through to the e-ticket. Writer: service-writer. Spec 76 consumes it.

## Tasks

- [x] 1. Create `src/core/entities/payment/payment.entity.ts` per the design (type imports of `Attendee`, `BookingStatus`, `PaymentMethod`, `PriceBreakdown` from the booking entity; types only, TSDoc as in the design) [Requirement 1]
- [x] 2. Create `src/core/services/payment.service.ts` (`PaymentServiceInterface`, `PaymentService`) and `src/core/services/__tests__/payment.service.test.ts` (Properties 1–3); register `paymentService` in `services.registry.ts`, add it to `AwilixRegistry` and to `KEYS` in `registry.test.ts` [Requirement 2, Requirement 6]
- [x] 3. Create `src/core/protocols/snap.protocol.ts` and `src/infrastructure/adapters/snap.adapter.ts` (`createSnapAdapter`, `createMockSnap`) with `src/infrastructure/adapters/__tests__/snap.adapter.test.ts` (Properties 4–7); add `SNAP_UNAVAILABLE` to `src/utils/constants/error-codes.ts` and `error_snap_unavailable` (ID and EN from the design) to both locale files [Requirement 3, Requirement 6]
- [x] 4. Add `readMockScenario()`, `mockSnapOutcome()` and the five scenarios (with comments) to `src/infrastructure/mocks/scenario.ts`, use `readMockScenario` in `browser.ts`; create `src/infrastructure/di/controllers/payment.ts` registering `snap` (mock when `config.apiMock`), add `snap` to `AwilixRegistry` and `KEYS` [Requirement 4, Requirement 5]
- [x] 5. Add `MockSnapAttempt` and `attempts` to `StoredBooking` in `mock-booking-store.ts`; in `booking.handlers.ts` save `attempts: []` on create and push attempt 1 on a successful payment entry [Requirement 5]
- [x] 6. Create `src/infrastructure/mocks/handlers/payment.handlers.ts` (the three tables in row order, `MOCK_SETTLE_MS`, ticket minting) and add `paymentHandlers` to `HANDLER_FACTORIES` in `handlers.ts` [Requirement 5]
- [x] 7. Tests: `src/infrastructure/mocks/__tests__/payment.handlers.test.ts` (every row, every scenario, replay vs new key, settle timing, PAID booking with tickets through `getBooking`, no NIK in problems) and the scenario cases in `scenario.test.ts` [Requirement 5, Requirement 6]
- [x] 8. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 3], [2, 4, 5], [6], [7], [8]] }
```

## Notes

- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage ≥ 85% on the changed files; key count =
  registration count.
- `snap` is registered in `di/controllers/payment.ts`, not `infrastructure.registry.ts` (scaffold rule, `qrEncoder`
  precedent); spec 77 adds `paymentController` there as the file's first `register` call.
- No `method` is ever sent (H-3); `csrfToken` is ignored on the web (bearer).
- The adapter drops Snap's callback payloads; never log the snap token.
- Commit: `feat(payment): [FR-20-W1] add the payment service, snap adapter and mocks`.
