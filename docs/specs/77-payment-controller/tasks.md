# Implementation Plan: Payment controller

## Overview

Create `src/controllers/payment.controller.ts`: read `?booking=`, load the view through `payBookingUseCase.load`,
preload snap.js, run "Bayar" as one mutation around `payBookingUseCase.pay` with the attempt ref (reuse the live
attempt; same key on a busy retry; new key after a failed attempt), poll `checkStatus` every 4 s while verifying, go to
`/tickets/detail?booking=` only on a server PAID, and return translated views for every state plus analytics. No
countdown (FR-21-W1), no expired screen (FR-23-W1), no method picker (H-3). Writer: controller-writer. Depends on specs
75–76; spec 78 renders it.

## Tasks

- [x] 1. Add `PAYMENT`, `PAYMENT_STATUS`, `SNAP_SCRIPT` to `QUERY_KEYS` and `PAYMENT_PAY` to `MUTATION_KEYS`; add `formatEventDay` to `src/utils/format/date.ts` (and reuse it in `formatEventDate`) and `priceItems` to `src/utils/analytics.ts`, each with unit tests [Requirement 4, Requirement 5]
- [x] 2. Create `src/controllers/payment.controller.ts` with the exported view types, `PaymentControllerInterface`, the deps type and the `Phase` type; the page-view effect, the load query, the snap preload query and the redirect effect (paid → e-ticket, 401 / unauthorized → sign-in) [Requirement 1, Requirement 2]
- [x] 3. Add the pay mutation (`retry: false`, no overlay), the attempt ref and guard, `onPay`, and the `onSuccess` / `onError` tables [Requirement 2, Requirement 5]
- [x] 4. Add the status poll query (enabled only while verifying, `refetchInterval: 4000`, hint in the key) and its once-per-update effect: paid, verifying reason, failed with attempt renewal, inactive; `purchase` and `payment_failed` analytics [Requirement 3, Requirement 5]
- [x] 5. Build the views: `state` (first-match order), `steps` with `done`, `intro`, `summary`, `pay`, `notice`, `progress`, `message`, `setLocale`, hrefs, per the design's state table [Requirement 1, Requirement 4]
- [x] 6. Register `paymentController: asFunction(PaymentController)` as the first `register` call in `src/infrastructure/di/controllers/payment.ts`; add it to `AwilixRegistry` and `KEYS` [Requirement 6]
- [x] 7. Tests in `src/controllers/__tests__/payment.controller.test.ts`: Properties 1–9 (query fake by key, captured mutation options, mocked `randomUuid`), the `onSuccess` table and the state table with `it.each`, analytics params, ID / EN formatting [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5, Requirement 6]
- [x] 8. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2], [3, 4], [5, 6], [7], [8]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run`; controller coverage ≥ 85%; `npm run lint`.
- Translation keys are written by spec 78 task 1 (same PR); the controller test mocks `t`.
- No loading overlay: the mutation stays pending while Snap is open; `pay.busy` carries it (design Overview).
- Navigation is `router.replace` (e-ticket and sign-in) so Back never reopens a paid payment page.
- Snap callbacks never mark paid; only a `paid` step from the server does.
- Commit: `feat(payment): [FR-20-W1] add the payment controller`.
