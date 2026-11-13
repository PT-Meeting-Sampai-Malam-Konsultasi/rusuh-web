# Implementation Plan: Order hold (controller)

## Overview

Extend `src/controllers/order.controller.ts` with `summary` (lines, fee once per order, total, note, dock count) and
`checkout` (labels, enabled, busy, hint, `onContinue`), one hold mutation around `holdBookingUseCase.execute` with the
loading overlay, the attempt ref (idempotency key per selection, known `bookingId`), the outcome handling (field marking
through `checks`, category flag + categories refetch, popups with `reference`, admission redirect, sign-in, navigation to
`/payment?booking=<id>`), the time's-up guard and analytics. Writer: controller-writer. Depends on specs 71 and 72; spec
74 renders it. Until FR-20-W1 (rusuh-web#19) merges, a successful hold lands on the not-found page.

## Tasks

- [ ] 1. Add `MUTATION_KEYS` (`ORDER_HOLD: 'order-hold'`) to `src/utils/constants/query-keys.ts`; add `OrderSummaryLine`, `OrderSummaryView`, `OrderCheckoutHint`, `OrderCheckoutView`, `summary` / `checkout` on `OrderControllerInterface`, and `holdBookingUseCase`, `useLoading`, `usePopupError` on `OrderControllerDeps` [Requirement 1, Requirement 2]
- [ ] 2. Add the `quote` memo, `leaving` and `holdFlag` state, `attemptRef`, `holdGuard`, the hold mutation (`toggleLoading` in all three paths, `retry: false`), `onContinue` with the ticket build and attempt renewal, `continueRef`, and the outcome table in `onSuccess` / `onError`; clear `holdFlag` in `applyQuantities` [Requirement 3, Requirement 4, Requirement 6]
- [ ] 3. Gate the expired latch on `!leaving && !holdMutation.isPending`; set `redirected.current` on `held` and on the active-booking action [Requirement 5]
- [ ] 4. Build the `summary` and `checkout` views (visibility, `enabled`, first-match `hint`, `busy`, formatted money with `formatRupiah`, translated labels) and return them [Requirement 1, Requirement 2]
- [ ] 5. Tests in `src/controllers/__tests__/order.controller.test.ts` (harness by `mutationKey`, `useLoading` / `usePopupError` fakes, mocked `@utils/random-uuid`; Properties 1–12, outcome table with `it.each`); add `summary: null`, `checkout: null` to `base()` in `src/presentation/pages/Order/__tests__/index.test.tsx` [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5, Requirement 6]
- [ ] 6. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2], [3, 4], [5], [6]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run`; controller coverage ≥ 85%; `npm run lint` runs in lint-staged (check the
  react-hooks rules: refs only in handlers / effects).
- Translation keys are written by spec 74 task 1 (same PR); the controller test mocks `t`, so it does not depend on them.
- `checkout`, not `continue`: a reserved word cannot be destructured in the shell.
- Loading: overlay (`toggleLoading`, required by the rule, and it freezes the selection the hold read) plus
  `checkout.busy` for `aria-busy` and the gap between `onSuccess` and the route change.
- The Snap token is never read; the payment page calls `enterPayment` again (idempotent) and needs the admission token,
  so nothing here clears it after `held`.
- Open questions for core (v1 has no cancel; SELECTION's own 5 minutes; create-stage `NIK_SEAT_TAKEN` without
  `nikMasked`) are in the design.
- Commit: `feat(order): [FR-16-W1] hold tickets and continue to payment`.
