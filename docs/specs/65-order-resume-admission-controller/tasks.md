# Implementation Plan: Order resume admission (controller)

## Overview

Handle spec 64's wider categories result in `orderController`: a `window-ended` answer (a reload's re-claim found the
turn over) latches spec 62's `expired`, so the FR-18 time's-up sheet shows at once and `endOrderWindowUseCase` /
`order_time_up` run once as today, with `status` left as computed (header + skeleton under the sheet) and no redirect.
A resumed `ok` answer tracks `order_resumed` `{ eventId }` once per visit. The countdown is unchanged: it anchors to the
resumed answer's own `expiresAt − serverNow`, so a reload at 2:12 shows 2:12. The categories query is unchanged. The
claim's 503 `ADMISSION_UNAVAILABLE`, which the order page now meets, gets its map entry and ID / EN copy. Writer:
controller-writer. Depends on spec 64.

## Tasks

- [x] 1. In `src/controllers/order.controller.ts`: after the clock effect, add `windowEnded = categoriesData?.kind === 'window-ended'` and change the guard to `if ((windowOver || windowEnded) && !expired) setExpired(true)`; update the `timeUp` doc comment [Requirement 1, Requirement 6]
- [x] 2. In the same file, after `ok` and the anchor: the `resumedTracked` ref and the `useEffect` that tracks `order_resumed` `{ eventId }` once when `ok?.resumed` is true [Requirement 4]
- [x] 3. Add `ADMISSION_UNAVAILABLE` after `ADMISSION_INVALID` to `CODES` in `src/utils/constants/error-codes.ts` and to `API_ERROR_CODES` in `src/infrastructure/i18n/__tests__/i18n.test.ts`; add `error_admission_unavailable` (ID / EN per the design) after `error_admission_invalid` in `src/translation/locale/id.json` and `en.json`, and assert both values in the i18n test [Requirement 5]
- [x] 4. In `src/controllers/__tests__/order.controller.test.ts`, `describe('order resume after reload (FR-19-W1)')` per the Testing Strategy: `window-ended` latches the sheet with `status` `'loading'` and `timer` null, use case and `order_time_up` (`tickets: 0`) once, no redirect, query disabled, also before the event loads and through a later event failure; `admission-invalid` still redirects once; thrown errors give the error state, `ADMISSION_UNAVAILABLE` mapped to its new key; a resumed 132 s answer gives 132 then 131; an already-expired resumed answer shows the sheet at once; `order_resumed` once and never for `resumed: false`; categories options and `queryFn` unchanged [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5, Requirement 6]
- [x] 5. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3], [4], [5]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run`; controller coverage ≥ 85%. Tasks 1 and 2 touch different lines of the
  same file; do them in one pass if simpler. Spec 64 must be in first (`resumed`, `window-ended`).
- Do not change the categories query (key, `enabled`, `gcTime`, `retry`, `placeholderData`, token read at fetch time),
  the countdown code (spec 59), the redirect effect, or the spec 62 expiry effect.
- No new DI key, interface field, popup or overlay. The page shell needs no change (spec 66 confirms).
- The `ADMISSION_UNAVAILABLE` copy is here, not in spec 66, because this commit is where the order page first surfaces
  claim errors. `LOGIN_REQUIRED` stays unmapped (open question in spec 64).
- With spec 64's stored-place check, a reload after the sheet has run goes to the waiting room (place removed), and a
  browser that never queued is redirected too; `window-ended` only follows a claim that ran.
- Decision recorded in the design: under the sheet for `window-ended`, `status` stays as computed (`'loading'` →
  header + skeleton); a new status was rejected (shell change for a state hidden by a modal).
- Accepted gap: if the first resumed load fails after the claim and the transient retry succeeds, that answer has
  `resumed: false` (the token is now in memory) and `order_resumed` is not tracked.
- Out of scope: order input across a refresh, the payment countdown (FR-21-W1), `queueController`.
- Commit: `feat(order): [FR-19-W1] resume the order window after a reload`.
