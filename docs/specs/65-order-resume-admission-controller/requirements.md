# Requirements Document

## Introduction

Page logic for FR-19-W1 (rusuh-web#18, "Countdowns from server time, kept across refresh"; parent FR-19,
rusuh-documentation#19). Spec 64 makes the categories use case claim the turn again after a reload (when a queue place
is stored) and adds two facts to its answer: `ok.resumed` and a new outcome `window-ended`. This spec handles them in
`orderController`: a `window-ended` answer latches the FR-18 time's-up state (spec 62's `expired`,
`endOrderWindowUseCase` once, the sheet), a resumed `ok` answer is tracked once as `order_resumed`, and the countdown
runs from the resumed answer's own `expiresAt − serverNow` (spec 59, unchanged), so a reload at 2:12 left shows 2:12,
not 5:00. Because the order page now reaches `claimTurn`, its 503 `ADMISSION_UNAVAILABLE` gets an `ERROR_CODE_MAP`
entry and ID / EN copy here. Sources: SRS FR-19 (`requirements/srs-v1.0-rusuh-booking-tiket.html` line 249:
server-authoritative timer, consistent on refresh); `architecture/sequence-diagrams.md` J9.6 (line 878), the J9.5 row for
`ADMISSION_UNAVAILABLE` (line 868: "The turn is kept, and the retry gets the same slot") and the clocks note (lines
881–882); `openapi.yaml` `claimTurn` (lines 789–792, 896); ADR-0005, ADR-0014 (ID/EN), ADR-0021, ADR-0030 (line 45,
same-device resume).

Use case: yes, spec 64 (`getOrderCategoriesUseCase` with the re-claim). No new use case here.

Out of scope: keeping picks, holders or NIKs across a refresh; the payment countdown (FR-21-W1, when the payment page is
built); the waiting room (`queueController` is unchanged: first entry still claims there and replaces to `/order`); new
UI (spec 66 confirms the shell needs none); `LOGIN_REQUIRED` copy.

## Glossary

| Term           | Definition                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Reload         | `/order?event=<id>` loaded with no admission token in memory; the categories use case claims again (spec 64) |
| Resumed answer | A categories `ok` answer with `resumed: true`: this load claimed the turn again                              |
| Window ended   | A categories answer `{ kind: 'window-ended' }`: a re-claim ran and said the turn is over                     |
| Expired        | Spec 62's latched controller state; drives `timeUp` and `timeUpSheet`                                        |
| Window over    | Spec 62's trigger `status === 'ready' && secondsLeft === 0`                                                  |
| Anchor         | Spec 59's `{ expiresAt, serverNow, receivedAt }`, written from each real (non-placeholder) `ok` answer       |

## Requirements

### Requirement 1: A reload that finds the window ended shows time's up at once

**User Story:**

AS a buyer who reopens the order page after my 5 minutes ran out
I WANT to see at once that my time is up
SO THAT I am not sent through the waiting room to find out, and can queue again from the sheet (FR-18, FR-19)

#### Acceptance Criteria

- WHEN the categories data is `{ kind: 'window-ended' }` THEN `expired` SHALL be set to true in that render (the same
  guarded render-time update as spec 62), whatever `status` is
- WHEN `expired` becomes true this way THEN spec 62's effect SHALL run once as today: `redirected.current = true`,
  `endOrderWindowUseCase.execute(eventId)`, `trackEvent('order_time_up', { eventId, tickets: 0 })`
- SHALL then disable the categories query (spec 62: `enabled: hasEventId && !expired`) and return a non-null
  `timeUpSheet` and `timeUp: true`
- SHALL keep `status` as computed today (no `ok` → `'loading'` when the event loaded; `'error'` / `'not-found'` as
  usual), so the page under the sheet is the flow header and the skeleton; `timer` SHALL be null
- SHALL NOT call `router.replace` for `window-ended`

### Requirement 2: Other outcomes keep their paths

**User Story:**

AS a buyer whose reload needs the waiting room (no stored place, sign in, wait, sold out) or failed
I WANT the same handling as before
SO THAT nothing new can trap me on the order page

#### Acceptance Criteria

- WHEN the categories data is `admission-invalid` and the event loaded THEN the controller SHALL call
  `router.replace('/queue?event=<id>')` once (the existing `redirected` guard), unchanged
- WHEN the categories query fails (a thrown claim or categories error) THEN `status` SHALL be `'error'` with
  `errorMessage` from `ERROR_CODE_MAP` (fallback `UNKNOWN_ERROR`) and `retry()` SHALL refetch it, unchanged
- SHALL keep the categories query key `[QUERY_KEYS.CATEGORIES, eventId, locale]`, `gcTime: 0`, `retry:
retryTransientOnce` and `placeholderData`, and keep reading the token at fetch time (`admissionStore.get(eventId)`)

### Requirement 3: The countdown carries on from the server's time left

**User Story:**

AS a buyer who reloads with 2:12 left
I WANT the timer to show 2:12
SO THAT the reload neither gives me extra time nor takes time away (FR-19, ADR-0005)

#### Acceptance Criteria

- WHEN a resumed `ok` answer has `expiresAt − serverNow` = 132 s THEN the first ready render SHALL return
  `timer.seconds` 132 (rendered "2:12" by `Timer`), and 1 s of elapsed client time later 131
- SHALL NOT change the countdown code of spec 59 (anchor, elapsed time, `Math.floor`, never negative)
- WHEN a resumed answer already has `expiresAt <= serverNow` THEN `timeUp` SHALL be true in the first ready render
  (spec 62 Property 3, unchanged)

### Requirement 4: Track the resume once

**User Story:**

AS the product team
I WANT to know how often buyers reload during their 5 minutes
SO THAT we can see whether the resume path is used and works

#### Acceptance Criteria

- WHEN an `ok` answer with `resumed: true` is shown THEN the controller SHALL call
  `analyticsAdapter.trackEvent('order_resumed', { eventId })` once per mounted page, in a `useEffect` guarded by a ref
- SHALL NOT track it for `resumed: false`, for a placeholder answer after the ref is set, or again on later renders
  (language switch, ticket changes)
- SHALL NOT send any token, NIK or name in the event

### Requirement 5: A calm message when the admission service is busy

**User Story:**

AS a buyer whose reload meets a busy admission service
I WANT a calm message that my turn is safe
SO THAT I press "Coba lagi" instead of leaving (ADR-0014)

#### Acceptance Criteria

- SHALL add `ADMISSION_UNAVAILABLE` to `CODES` in `src/utils/constants/error-codes.ts` (so `ERROR_CODE_MAP` maps it to
  `error_admission_unavailable`) and to `API_ERROR_CODES` in `src/infrastructure/i18n/__tests__/i18n.test.ts`
- SHALL add `error_admission_unavailable` after `error_admission_invalid` to `src/translation/locale/id.json` ("Pesanan
  Anda sedang disiapkan. Giliran Anda tetap aman, coba lagi sebentar lagi.") and `en.json` ("We're getting your order
  ready. Your turn is safe; please try again in a moment."), keeping the same key set, and assert both values
- WHEN the categories query fails with `ADMISSION_UNAVAILABLE` THEN `errorMessage` SHALL be
  `t('error_admission_unavailable')`

### Requirement 6: Interface, DI and tests

**User Story:**

AS a developer
I WANT the controller to handle the wider result without breaking FR-11–FR-18 behaviour
SO THAT the page keeps working

#### Acceptance Criteria

- SHALL keep `OrderControllerInterface` and `OrderControllerDeps` unchanged except the `timeUp` doc comment (now also
  latched by a reload that finds the window ended)
- SHALL keep every existing test passing (fixtures carry `resumed: false` since spec 64)
- SHALL test: `window-ended` latches the sheet, runs the use case and `order_time_up` once, no redirect, query disabled;
  `window-ended` before the event loads; the sheet stays when the event query later fails; `admission-invalid` still
  redirects once; a thrown error shows the error state, with `ADMISSION_UNAVAILABLE` mapped; a resumed 132 s answer
  gives 132 then 131; `order_resumed` once for `resumed: true`, never for `false`, not again after a language switch;
  the categories key unchanged; coverage ≥ 85%
