# Requirements Document

## Introduction

Page logic for FR-18-W1 (rusuh-web#17, "Web: Order: time's-up sheet and queue again"; parent FR-18,
rusuh-documentation#18). Spec 59 left `orderController.timeUp` with no consumer. This spec makes the order window's end
final on the page: the first time it reaches zero the controller latches an `expired` state for the life of the page,
ends the window on this device once (`endOrderWindowUseCase`, spec 61), tracks it, stops the categories query and any
later `admission-invalid` redirect from pulling the page away, and exposes `timeUpSheet` (translated texts, home link and
`queueAgain`) for the sheet of spec 63. Sources: SRS FR-18 (`requirements/srs-v1.0-rusuh-booking-tiket.html` line 248:
session cancelled, slot released to the next in line, the customer is notified and directed out of the booking page);
`analysis/requirements-review.md` A-10 / Q-26 (21 Oct: queue again at the back) and A-11 / Q-28 (the 5-minute window
ends at the hold); `architecture/customer-journey.md` T1 (lines 305–309); `architecture/lld-02-core-module.md` line 77
(no email for an expiry from SELECTION: "notified" is the in-app sheet plus the way out); `openapi.yaml` `joinQueue`
("Antre lagi" after a place ended gives a new number at the back); ADR-0005 (server-time timers), ADR-0014 (ID/EN),
ADR-0030 (same-device resume is for a live turn only); HiFi `analysis/hifi/detail.html` lines 13 (`data-onzero="expired"`)
and 63–70.

Use case: yes, spec 61 (`endOrderWindowUseCase`): forgetting the admission token and the stored queue place is a
business rule on tokens and storage, which the controller rule keeps out of the controller.

Out of scope: keeping the countdown across a refresh (FR-19-W1, rusuh-web#18); the payment countdown and its expiry
(FR-21 / FR-23); the hold; any server release call; disabling steppers or fields under the sheet; focus trapping (spec 63
notes it as the follow-up shared with `QueueLeaveSheet`); the sheet's markup and copy files (spec 63).

## Glossary

| Term            | Definition                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Window over     | `status === 'ready' && secondsLeft === 0`: spec 59's `timeUp` expression, now the trigger                           |
| Expired         | Controller state, false at mount, set to true the first render the window is over, never set back                   |
| Latch           | The rule that `expired` stays true for the life of the mounted page whatever `status` or the queries do later       |
| End the window  | The one-time effect on the first expiry: `endOrderWindowUseCase.execute`, `order_time_up` analytics, redirect guard |
| Time's-up sheet | The dialog of spec 63: "Waktu habis", "5 menit sudah lewat.", "Antre lagi →", "Ke beranda"                          |
| Queue again     | Leave `/order` for `/queue?event=<id>`; the waiting room joins at the back because spec 61 forgot the place         |
| `redirected`    | The existing `useRef(false)` that makes the `admission-invalid` redirect happen at most once                        |
| Sweeper         | The queue service job (every 1 s) that releases admissions past their end                                           |

## Requirements

### Requirement 1: The expiry latches

**User Story:**

AS a buyer whose 5 minutes ran out
I WANT the page to stay in the time's-up state
SO THAT the message does not flicker away when the page reloads its data or texts

#### Acceptance Criteria

- SHALL keep `expired` in `useState(false)` and set it to true in the first render where the window is over (guarded
  render-time update, the spec 59 anchor pattern), never back to false while mounted
- SHALL expose `timeUp` as `expired` (same field name; the doc comment says it is latched and drives the sheet)
- WHEN the window is over at the first ready render (an answer with `expiresAt` at or before `serverNow`, or a page
  opened late) THEN `expired` SHALL be true in that render's result
- WHEN `status` later leaves `'ready'` (an event refetch on focus fails; an answer already in flight turns the categories
  into `admission-invalid`) THEN `timeUp` SHALL stay true and `timeUpSheet` SHALL stay non-null
- WHEN the window is not over and never was THEN `timeUp` SHALL be false and `timeUpSheet` null
- SHALL keep `timer` as in spec 59 (it stays `{ seconds: 0, label }` while status is `'ready'`)

### Requirement 2: End the window once

**User Story:**

AS the queue (and the next buyer in it)
I WANT this device to drop the ended turn exactly once
SO THAT the next visit joins at the back and nothing is counted twice

#### Acceptance Criteria

- WHEN `expired` first becomes true THEN, in a `useEffect` (never in the render body), the controller SHALL once:
  set `redirected.current = true`; call `endOrderWindowUseCase.execute(eventId)`; call
  `analyticsAdapter.trackEvent('order_time_up', { eventId, tickets: totalTickets })`
- SHALL guard the effect with its own ref so later renders (ticket count, language, status changes) never repeat it
- SHALL add `endOrderWindowUseCase` to `OrderControllerDeps` (registered by spec 61)
- SHALL NOT call any service or API operation for the expiry, and SHALL NOT open a popup, an error popup or the loading
  overlay
- SHALL NOT navigate on its own at zero: the buyer chooses "Antre lagi" or "Ke beranda" (SRS "directed out" is the
  sheet's two exits)

### Requirement 3: Nothing pulls the page away behind the sheet

**User Story:**

AS a buyer reading the time's-up message
I WANT the page to stay put until I choose
SO THAT I am not bounced to the waiting room by an answer that arrives a moment later

#### Acceptance Criteria

- SHALL disable the categories query once expired: `enabled: hasEventId && !expired`
- WHEN the language changes after expiry THEN the categories query SHALL NOT fetch (its key changes, the placeholder keeps
  the previous answer), the page SHALL stay rendered and `timer.seconds` SHALL stay 0
- WHEN a categories answer or a NIK check in flight answers `admission-invalid` after expiry THEN the controller SHALL NOT
  call `router.replace` (the existing `redirected` guard, set by the expiry effect)
- WHEN `admission-invalid` arrives before expiry THEN the redirect SHALL happen once, as today

### Requirement 4: The sheet's content and actions

**User Story:**

AS a buyer whose time ran out
I WANT to be told plainly what happened and offered a way back into the line, in my language
SO THAT I can try again at once (Q-26) or leave (ADR-0014)

#### Acceptance Criteria

- SHALL export `OrderTimeUpView { stamp, title, body, queueAgainLabel, homeLabel, homeHref, queueAgain }` and add
  `timeUpSheet: OrderTimeUpView | null` to `OrderControllerInterface`, non-null exactly when `expired`
- SHALL fill the texts with `t('order_time_up_stamp')`, `t('order_time_up_title')`, `t('order_time_up_body')`,
  `t('order_time_up_queue_again')` (written by spec 63) and the existing `t('action_back_home')`, and `homeHref` with
  `ROUTES.HOME`
- WHEN the language changes THEN the sheet texts SHALL be retranslated in the next render
- WHEN `queueAgain()` runs THEN it SHALL track `queue_rejoin` `{ eventId, from: 'order' }` and call
  `router.replace(withQuery(ROUTES.QUEUE, { event: eventId }))`
- SHALL NOT pass `t` for the sheet: the section receives strings (props-in / JSX-out, like `OrderMessage`)

### Requirement 5: Interface, DI and tests

**User Story:**

AS a developer
I WANT the controller extended without breaking FR-11–FR-17 behaviour
SO THAT the page keeps working and the sheet can be built on it

#### Acceptance Criteria

- SHALL keep every other field and behaviour unchanged (event / categories / me queries before expiry, steppers,
  holders, NIK checks, the admission redirect before expiry, the countdown)
- SHALL add `timeUpSheet: null` to the fake controller in `src/presentation/pages/Order/__tests__/index.test.tsx` so
  `tsc --noEmit` passes (rendering is spec 63)
- SHALL test with fake timers: sheet null before zero; non-null at zero and at once for an already-expired answer; the
  use case called once with the event id; `order_time_up` once with the ticket count; the latch surviving a status
  change; the categories query disabled after expiry; no redirect for `admission-invalid` after expiry (categories and
  NIK check); `queueAgain` replacing to the queue URL and tracking `queue_rejoin`; the texts retranslated on a language
  switch; coverage ≥ 85%
