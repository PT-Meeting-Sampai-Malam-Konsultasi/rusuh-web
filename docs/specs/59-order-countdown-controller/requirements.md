# Requirements Document

## Introduction

Page logic for FR-17-W1 (rusuh-web#16, "Web: Order: 5-minute countdown from server time"; parent FR-17,
rusuh-documentation#17). `orderController` exposes the 5-minute order-window countdown (ADR-0005; team answers N-3, Q-12)
as a `timer` (whole seconds left and a translated label, the shape the shared `Timer` component takes) and a `timeUp`
flag, computed from the `expiresAt` and `serverNow` that `getOrderCategoriesUseCase` (spec 13) already returns, plus the
time elapsed on the client since that answer arrived. Sources: ADR-0005 ("the server sends `expires_at` and `server_now`,
so a wrong phone clock does not matter"), `architecture/customer-journey.md` F2 (server countdown), F22 (the countdown
keeps running during login), T1 (5 minutes pass without a hold → FR-18), `analysis/hifi-api-review.md` ("always
`expiresAt − serverNow` … never the device clock"), `openapi.yaml` `getCategories`, HiFi `analysis/hifi/detail.html`
lines 13 and 15, ADR-0014 (ID/EN). Spec 60 renders it.

No service, entity or use-case spec: there is no new API operation and no new business outcome. The use case of spec 13
already carries `expiresAt` / `serverNow`; the countdown itself is one subtraction plus a 1-second clock, which the
controller rule assigns to the controller ("Timers derived from server time"; "Countdowns: compute from
`expiresAt − serverNow` (plus elapsed client time since the response)"), as `queue.controller.ts` already does for the
60-second turn window.

Out of scope: the time's-up sheet, "Antre lagi" and any redirect at zero (FR-18-W1, rusuh-web#17; this spec only exposes
`timeUp`); keeping the countdown across a refresh (FR-19-W1, rusuh-web#18; a reload refetches `getCategories`, which is
enough here); the payment countdown (FR-21-W1); the hold and "Lanjut ke Pembayaran"; disabling steppers or fields at
zero; formatting the value and the pink warning state (the `Timer` component does both, spec 60); the API contract drift
in the updated `openapi.yaml` (`/core/…` path prefixes, `reservedUnits` → `maxTickets`).

## Glossary

| Term           | Definition                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| Order window   | The 5 minutes from claiming the turn to creating the hold (ADR-0005); its end is `expiresAt` from `getCategories`    |
| Answer         | A real (not placeholder) `ok` result of the categories query                                                         |
| Anchor         | The controller's record of the answer the countdown runs from: its `expiresAt`, its `serverNow`, and when it arrived |
| Arrival moment | The categories query's `dataUpdatedAt` for that answer (device clock, used only to measure elapsed time)             |
| Window length  | `(Date.parse(expiresAt) − Date.parse(serverNow)) / 1000` seconds: server times only                                  |
| Elapsed        | `(clock − arrival moment) / 1000` seconds, never below 0: a difference of two device-clock readings                  |
| Seconds left   | `max(0, window length − elapsed)`; `timer.seconds` is this number rounded down                                       |
| Clock          | A `now` state refreshed every second by `setInterval` while the countdown runs                                       |
| Placeholder    | The previous answer shown by `placeholderData` while a new query key (a language switch) loads                       |
| Timer          | The shared component `src/presentation/components/Timer/` (`seconds`, `label`, `warnAt`): formats and warns          |

## Requirements

### Requirement 1: Seconds left from server time

**User Story:**

AS a buyer whose phone clock is wrong
I WANT the time left to choose computed from the server's times
SO THAT what I see matches when the server really closes my order window

#### Acceptance Criteria

- SHALL compute seconds left as `(Date.parse(expiresAt) − Date.parse(serverNow)) / 1000 − elapsed`, clamped at 0, where
  `elapsed` is the client time passed since the answer arrived
- SHALL expose `timer.seconds` as the whole seconds left (`Math.floor`, never negative): 300 → 300, 252.9 → 252, 0 → 0;
  the same shape the queue controller gives `QueueTurn` (`turn.seconds`)
- SHALL expose `timer.label` as `t('order_timer_label')` ("sisa waktu memilih" / "left to choose")
- WHEN the device clock is hours or years away from `serverNow` THEN `timer.seconds` SHALL be the same as with a correct
  clock
- SHALL NOT format the value or decide the warning state (the `Timer` component does both)
- SHALL NOT compare `Date.now()` with `expiresAt`, and SHALL NOT store a deadline in `storage`, `sessionStorage` or
  `localStorage`

### Requirement 2: Ticking

**User Story:**

AS a buyer choosing tickets
I WANT the countdown to move every second
SO THAT I can pace myself

#### Acceptance Criteria

- SHALL keep one clock (`useState(() => Date.now())` + `setInterval(…, 1000)` in `useEffect`), the same pattern as
  `queue.controller.ts`
- WHEN there is an anchored `ok` answer and seconds left is above 0 THEN the clock SHALL tick; otherwise no interval SHALL
  run
- WHEN seconds left reaches 0 THEN the interval SHALL be cleared and `timer.seconds` SHALL stay 0
- WHEN the controller unmounts THEN the interval SHALL be cleared
- WHEN the tab was in the background (throttled timers) THEN the next tick SHALL show the true remaining time (each tick
  reads the clock; it does not subtract one)
- SHALL NOT call a service or use case from the effect

### Requirement 3: Time-up flag

**User Story:**

AS the next ticket (FR-18-W1)
I WANT the page to know when the order window has run out
SO THAT it can tell the buyer to queue again

#### Acceptance Criteria

- WHEN seconds left is 0 THEN `timeUp` SHALL be true and `timer` SHALL stay `{ seconds: 0, label }`
- WHEN the answer arrives with `expiresAt` at or before `serverNow` THEN `timeUp` SHALL be true at once
- WHEN seconds left is above 0 THEN `timeUp` SHALL be false
- SHALL NOT redirect, open a popup, track an analytics event or change any other field when time is up (FR-18-W1)

### Requirement 4: The countdown stays anchored to its answer

**User Story:**

AS a buyer who switches language mid-order
I WANT the countdown to carry on
SO THAT it never jumps to 0:00 or back to 5:00 because the page reloaded its texts

#### Acceptance Criteria

- SHALL keep an anchor `{ expiresAt, serverNow, receivedAt }` in controller state, taken from a real `ok` answer and that
  answer's `dataUpdatedAt`
- WHEN the categories query shows placeholder data (`isPlaceholderData`, e.g. the key changed with the language) THEN the
  anchor SHALL NOT change, the seconds SHALL continue from the same anchor, and `timeUp` SHALL NOT become true because of
  the new query's `dataUpdatedAt` of 0
- WHEN a new real `ok` answer arrives (new language loaded, refetch, retry) THEN the countdown SHALL re-anchor to that
  answer's `expiresAt`, `serverNow` and `dataUpdatedAt` (a resync with the server)
- WHEN only the language changes THEN `timer.label` SHALL be retranslated without resetting the seconds

### Requirement 5: States without a countdown

**User Story:**

AS a buyer on the loading, error or not-found view
I WANT no timer rather than a wrong one
SO THAT I never see "NaN:NaN" or a countdown for a turn I do not have

#### Acceptance Criteria

- WHEN `status` is not `'ready'` (loading, error, not-found, admission-invalid redirect) THEN `timer` SHALL be `null` and
  `timeUp` SHALL be false
- WHEN `expiresAt` or `serverNow` is missing or does not parse (`NaN`) THEN `timer` SHALL be `null`, `timeUp` SHALL be
  false and no interval SHALL run
- SHALL NOT expose `NaN`, a negative or fractional number, ISO strings or `Date` objects to the screen

### Requirement 6: Interface, DI and tests

**User Story:**

AS a developer
I WANT the controller extended without breaking FR-11–FR-15 behaviour
SO THAT the page keeps working while the countdown arrives

#### Acceptance Criteria

- SHALL export `OrderTimerView { seconds: number; label: string }` and add `timer: OrderTimerView | null` and
  `timeUp: boolean` to `OrderControllerInterface`
- SHALL NOT add a DI key, an import, an analytics event, a popup or a query; `OrderControllerDeps` stays as it is
- SHALL keep every other field and behaviour unchanged (queries, steppers, holders, NIK checks, admission redirect)
- SHALL add `timer: null` and `timeUp: false` to the fake controller in
  `src/presentation/pages/Order/__tests__/index.test.tsx` so `tsc --noEmit` passes (rendering is spec 60)
- SHALL test with fake timers: the first value under a wrong device clock, ticking, the stop at 0 with `timeUp`, the null
  states, `NaN` dates, the placeholder / language switch, re-anchoring, and the interval cleared on unmount;
  coverage ≥ 85% (the warning state is tested in spec 60)
