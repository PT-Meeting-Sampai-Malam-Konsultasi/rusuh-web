# Implementation Plan: Order resume admission (page and mock)

## Overview

No new UI: the Order shell already renders the time's-up sheet whenever `timeUpSheet` is non-null, outside every
`status` branch; a test pins it over the loading and error states (spec 65's `window-ended` path). The mock API learns
what the real server does: `getCategories` answers `expiresAt = admittedAt + window` of the latest admitted mock place
for the event (fresh `now + window` without one), the same on every request and answered as is once past; the mock
queue ends an admitted place after its window (410 `EXPIRED`, rejoin at the back). The queue and booking mocks share one
state per `createHandlers` call. The mock `fallbackToken` stays. No copy change (the `ADMISSION_UNAVAILABLE` message is
spec 65). Writer: presentation-writer. Depends on specs 64 and 65.

## Tasks

- [x] 1. Extract the mock queue state into `src/infrastructure/mocks/handlers/mock-queue-state.ts` (`MockPlace`, `MockQueue`, load / persist under `rusuh.mock.queue`, `lastAdmittedAt`, `ORDER_WINDOW_MS`, `MOCK_SHORT_ORDER_WINDOW_MS`, `ADMISSION_MS`, `orderWindowMs`); add `MockHandlerContext` to `shared.ts`; make `createHandlers` build one state and pass `{ ...context, queueState }` to every factory; update the `MOCK_SHORT_ORDER_WINDOW_MS` import in `booking.handlers.test.ts` [Requirement 3]
- [x] 2. In `queue.handlers.ts`: use the shared state; add `ended(place, time)` (admitted and at or past `admittedAt + orderWindowMs(scenario)`); join treats an ended place like a missed one (new number at the back); claim and `GET me` delete it and answer 410 `EXPIRED` [Requirement 3]
- [x] 3. In `booking.handlers.ts` `getCategories`: `expiresAt = (live lastAdmittedAt ?? now) + orderWindowMs(scenario)` with live meaning `now − admittedAt < ADMISSION_MS`; a past `expiresAt` answered as is; every other branch unchanged [Requirement 2]
- [x] 4. Tests: `src/infrastructure/mocks/__tests__/order-window.handlers.test.ts` per the Testing Strategy (window from the claim, same across requests and locales, 132 s after 168 s, `short_window`, past end as is, fresh window without a claim or after `ADMISSION_MS`, `EXPIRED` on claim and read, rejoin at the back, one state per `createHandlers`); and in `src/presentation/pages/Order/__tests__/index.test.tsx` the sheet over `status` `'loading'` (skeleton, no timer) and `'error'` [Requirement 1, Requirement 2, Requirement 3, Requirement 4]
- [x] 5. Run the gate check and the manual reload check under `?mock=short_window` at 390 and 1440, ID and EN (reload at ~0:40 continues at ~0:39; language switch keeps counting; reload after 0:00 shows the sheet at once; "Antre lagi" gives a new number without the missed screen; `/order` opened directly still starts fresh; no admission token in storage or cookies) [ALL] — Checked at 1440 in ID and EN: reload 0:37 → 0:35, language switch kept counting, reload after 0:00 showed the sheet at once, "Antre lagi" gave a new number (the mock then asked to sign in: mock sessions end on a reload, unrelated). Not checked by eye: 390 (no UI change), `/order` opened directly.

## Task Dependency Graph

```json
{ "waves": [[1], [2, 3], [4], [5]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run && npm run build`; `npm run lint` runs in lint-staged. Specs 64 and 65
  must be in first (same PR).
- No change to `src/presentation/pages/Order/index.tsx`, its sections, `src/app/order/page.tsx` or the locale files.
- The mock `fallbackToken` stays: removing it would make `/order` opened directly in mock mode redirect to the waiting
  room (no stored place, spec 64). Consequence: spec 64's stored-place check and re-claim are not exercised in mock
  mode; specs 64 / 65 unit tests cover them, and a staging check confirms them on the real API.
- Mock-specific: a reload after 0:00 shows the sheet again (fallback token, past `expiresAt`); on the real API the
  place was removed at 0:00, so it goes to the waiting room.
- Spec 60's caveat (a language switch restarts the mock count) is gone for a claimed place; it remains only for `/order`
  opened directly.
- The `ended` rule fixes a mock gap that FR-18 hid: a rejoin after time's up used to get the old admitted place back,
  whose window would now be past (time's up again at once).
- Out of scope: order input across a refresh, the payment countdown (FR-21-W1; rusuh-web#18 also lists Payment, which
  follows when that page is built), any new section, style or copy.
- Commit: `feat(order): [FR-19-W1] tie the mock order window to the claim`.
