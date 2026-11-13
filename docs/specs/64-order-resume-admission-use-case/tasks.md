# Implementation Plan: Order resume admission (use case)

## Overview

Make `getOrderCategoriesUseCase` claim the turn again when the order page has no admission token (a reload: the token
lives in memory only) and this browser has a stored queue place, so the categories answer carries the same lease end and
the countdown continues (FR-19, J9.6, ADR-0030). No stored place → `admission-invalid` without a claim (the waiting room
joins, as today). `admitted` → categories with the returned token and `resumed: true`; `missed` from a claim that ran →
new `{ kind: 'window-ended' }`; `sign-in` / `retry` / `paused` / `sold-out` → `admission-invalid`; claim errors
propagate. A token that exists is never re-claimed, even when rejected. New dependencies `claimTurnUseCase` and
`queuePlaceStore` (read only; no new DI key). Writer: use-case-writer. Spec 65 handles the new outcome in the
controller; spec 66 aligns the mock.

## Tasks

- [x] 1. In `src/core/use_case/booking/get-order-categories.use-case.ts`: add `resumed: boolean` to the `ok` member and the `{ kind: 'window-ended' }` member of `OrderCategoriesResult`; widen the deps to `Pick<AwilixRegistry, 'bookingService' | 'claimTurnUseCase' | 'queuePlaceStore'>`; move the categories call into a `load(eventId, token, resumed)` closure; with no token, return `admission-invalid` when `queuePlaceStore.get(eventId)` is null, else claim once and classify (`admitted` → `load(…, true)`, `missed` → `window-ended`, others → `admission-invalid`), letting thrown errors propagate; with a token, `load(…, false)` with no store read and no claim [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5]
- [x] 2. Rewrite `src/core/use_case/booking/__tests__/get-order-categories.use-case.test.ts` per the Testing Strategy: `claimTurnUseCase` and `queuePlaceStore` mocks in `setup()`; no-place branch without claim or request; every claim branch; claim before categories and with the returned token; one claim per call; no claim or store read with a token; no claim after a rejected token; `resumed` true / false; `queuePlaceStore.set` / `remove` never called; errors from the claim and from `getCategories` propagate unchanged; no state between calls [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5]
- [x] 3. Add `resumed: false` to `okResult` in `src/controllers/__tests__/order.controller.test.ts` so `tsc --noEmit` passes (no behaviour change; spec 65 adds the tests) [Requirement 5]
- [x] 4. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 3], [4]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run`; `src/infrastructure/di/__tests__/registry.test.ts` must still pass (no
  key added: `claimTurnUseCase` and `queuePlaceStore` are already registered). Coverage ≥ 85%.
- Do not change `claimTurnUseCase`: it already stores the token (`admissionStore.set`) and forgets a gone place.
- `queuePlaceStore` is read only here (`get`); removals stay with `claimTurnUseCase.forget` and `endOrderWindowUseCase`.
  Rule tension (store protocol as a dependency) recorded in the design, as in spec 61.
- After the FR-18 sheet has run, the stored place is gone, so a reload then goes to the waiting room (new number), not
  to `window-ended`.
- Never store the admission token anywhere but `admissionStore` (through the claim). No `sessionStorage`, no logging.
- Recorded difference from J9.5 line 869 (core `ADMISSION_INVALID` → "claim again"): only a missing token claims here;
  a rejected token goes to the waiting room, which claims there. No loop.
- Recorded limitation: `MOVED` → `window-ended` (folded into `missed` by `claimTurnUseCase`); follow-up could carry the
  code.
- Mock mode never runs the no-token branches (`MOCK_ADMISSION_TOKEN` fallback); the unit tests cover them (spec 66).
- Out of scope: order input across a refresh, the payment countdown (FR-21-W1, follows when the page exists),
  `LOGIN_REQUIRED` / `ACCOUNT_HAS_PLACE_ELSEWHERE` classification in `claimTurnUseCase`.
- Commit: `feat(order): [FR-19-W1] claim again when the order page reloads`.
