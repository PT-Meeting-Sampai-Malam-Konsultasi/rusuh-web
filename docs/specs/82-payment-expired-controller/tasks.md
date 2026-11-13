# Implementation Plan: Payment expired (controller)

## Overview

Extend `PaymentController` with the `expired` state and `PaymentExpiredView` from spec 81's `InactiveOutcome`: the
phase carries the outcome, a seen order (last real `ready` answer of the visit) survives the refetch that turns the page
expired, the body picks the held-ticket count, the note picks the definite refund text or the conditional one with the
visit's `customerEmail`, and "Antre lagi" forgets the turn (`endOrderWindowUseCase`), tracks `queue_rejoin` and replaces
the page with `/queue?event=<id>`. `reason: 'other'` keeps the existing inactive message. Writer: controller-writer.
Depends on spec 81; spec 83 renders the view and writes the copy (same PR).

## Tasks

- [x] 1. In `src/controllers/payment.controller.ts`: add `'expired'` to `PaymentScreenState`, export `PaymentExpiredView`, add `expired` to `PaymentControllerInterface` and `endOrderWindowUseCase` to `PaymentControllerDeps`; change `Phase`'s inactive member to `{ kind: 'inactive'; outcome: InactiveOutcome }` and update the pay `onSuccess` and status-step handler [Requirement 1, Requirement 7]
- [x] 2. In the same file: the `seen` state written with the anchor; `ended`, the new state line (`expired` / `inactive`) and `refund` from it; `summary` from `seen` in `expired` (`showsOrder` gains `'expired'`, `pay` stays null) [Requirement 1, Requirement 5]
- [x] 3. In the same file: the `expired` view (count body, note lead / refund / e-mail / account text) and `onQueueAgain` (once-only ref: `endOrderWindowUseCase.execute`, `ANALYTICS_EVENTS.QUEUE_REJOIN` `{ eventId, from: 'payment' }`, `router.replace(withQuery(ROUTES.QUEUE, { event }))`); `message` unchanged for `inactive` [Requirement 2, Requirement 3, Requirement 4, Requirement 6]
- [x] 4. Tests in `src/controllers/__tests__/payment.controller.test.ts` per the Testing Strategy (sources of `expired`, count / note / e-mail branches, "Antre lagi" order and once-only, `reason: 'other'`, hidden fields, no extra `payment_expired`); add `expired: null` to `base()` in `src/presentation/pages/Payment/__tests__/index.test.tsx` [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5, Requirement 6, Requirement 7]
- [x] 5. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2], [3], [4], [5]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run`; coverage ≥ 85%; `npm run lint`. Tasks 1–3 edit one file in sequence.
- No change to the countdown, its refetch at zero or `payment_expired` (FR-21-W1). `TIMER_STATES` does not gain
  `'expired'`.
- `endOrderWindowUseCase` is already registered in `registerAll()`; `src/infrastructure/di/controllers/payment.ts` is
  unchanged. Count DI keys vs registrations anyway.
- Lifts spec 79's "SHALL NOT build the expired screen or 'Antre lagi' (FR-23-W1)".
- Commit: `feat(payment): [FR-23-W1] show the expired order and queue again`.
