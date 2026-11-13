# Requirements Document

## Introduction

Page logic for FR-21-W1 ("Web: Payment: 10-minute countdown"; parent FR-21, rusuh-documentation: "Sistem menampilkan
hitung mundur (countdown) batas waktu pembayaran 10 menit sejak booking", MUST; BR-05 "Batas waktu pembayaran = 10 menit
sejak booking dibuat"). `paymentController` exposes the payment-window countdown as a `timer` (whole seconds left and a
translated label, the shape the shared `Timer` component takes) and a `timeUp` flag, computed from the `expiresAt` and
`serverNow` that `payBookingUseCase.load` (spec 76) already returns in `view`, plus the client time elapsed since that
answer arrived. At zero it disables "Bayar", asks the server once more (the server, not the client, moves the page to the
existing `inactive` state) and tracks `payment_expired` once. Sources: ADR-0005 ("the server sends `expires_at` and
`server_now`, so a wrong phone clock does not matter"), ADR-0026 (hard deadline, no grace buffer; the sweeper cancels
and releases), `architecture/customer-journey.md` §8 H9 (`GET /payment/{id}` → `expires_at`, `server_now`) and H10
("Show order summary + 10-min countdown FR-21"), `analysis/hifi-api-review.md` ("always `expiresAt − serverNow` … never
the device clock"), `openapi.yaml` `getPaymentPage` / `getPaymentStatus`, HiFi `analysis/hifi/src/payment.html` lines 7
and 9 (`data-warn="120"`, label "untuk membayar" / "left to pay", shown in the select / va / qris / verifying states),
ADR-0014 (ID/EN). Spec 80 renders it.

No service, entity or use-case spec: there is no new API operation and no new business outcome.
`payBookingUseCase.load` already returns `{ kind: 'ready', view }` with `view.expiresAt` / `view.serverNow`
(`src/core/entities/payment/payment.entity.ts`, "For FR-21-W1; not shown in this ticket"; spec 75), and a 409
`BOOKING_NOT_HELD` on load is already settled into `inactive` / `paid` by the use case. The countdown is one subtraction
plus a 1-second clock, which the controller rule assigns to the controller, exactly as spec 59 did for the order window.

This spec lifts two deferrals of spec 77: Requirement 1 "SHALL NOT render, compute or expose a countdown (FR-21-W1)"
(and its Property 7 "no countdown field exists on the interface"), and "`payment_expired` analytics (with FR-21 /
FR-23)" (the `payment_expired` half only).

Out of scope: the full "Waktu habis / Pesanan dibatalkan" expired screen and "Antre lagi" (FR-23-W1; the existing
`inactive` message stays the outcome); deciding expiry on the client alone; the expiry e-mail (backend, FR-23);
`order_expired` analytics; keeping the countdown across a refresh beyond refetching the page (a reload calls
`getPaymentPage`, which re-anchors; NFR-02-W1); formatting the value and the pink warning (the `Timer` component, spec
80).

## Glossary

| Term           | Definition                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Payment window | The 10 minutes from the hold (ADR-0005, BR-05); its end is `view.expiresAt` from `getPaymentPage`            |
| Answer         | A real (not placeholder) `ready` result of the page query (`pageQuery`)                                      |
| Anchor         | `{ expiresAt, serverNow, receivedAt }` of the answer the countdown runs from, in controller state            |
| Arrival moment | `pageQuery.dataUpdatedAt` of that answer (device clock, used only to measure elapsed time)                   |
| Window length  | `(Date.parse(expiresAt) − Date.parse(serverNow)) / 1000` seconds: server times only                          |
| Elapsed        | `max(0, clock − arrival moment) / 1000` seconds: a difference of two device-clock readings                   |
| Seconds left   | `max(0, window length − elapsed)`; `timer.seconds` is this rounded down                                      |
| Clock          | A `now` state refreshed every second by `setInterval` while the countdown is shown and above zero            |
| Timer states   | `ready`, `opening`, `verifying`, `failed`, `busy`: the states where the screen shows the order and the timer |
| Time up        | Seconds left is 0 while in a timer state                                                                     |

## Requirements

### Requirement 1: Seconds left from server time

**User Story:**

AS a buyer whose phone clock is wrong
I WANT the time left to pay computed from the server's times
SO THAT what I see matches when the server really cancels my booking (ADR-0026: no grace)

#### Acceptance Criteria

- SHALL compute seconds left as `(Date.parse(expiresAt) − Date.parse(serverNow)) / 1000 − elapsed`, clamped at 0, where
  `elapsed` is the client time since the answer arrived (`pageQuery.dataUpdatedAt`)
- SHALL expose `timer.seconds` as whole seconds (`Math.floor`, never negative): 600 → 600, 551.9 → 551, 0 → 0
- SHALL expose `timer.label` as `t('payment_timer_label')` ("untuk membayar" / "left to pay")
- WHEN the device clock is hours or years away from `serverNow` THEN `timer.seconds` SHALL be the same as with a correct
  clock
- SHALL NOT format the value or decide the warning state (the `Timer` component does both, spec 80)
- SHALL NOT compare `Date.now()` with `expiresAt`, and SHALL NOT store a deadline in `storage`, `sessionStorage` or
  `localStorage`

### Requirement 2: Ticking

**User Story:**

AS a buyer paying
I WANT the countdown to move every second
SO THAT I know how long I have

#### Acceptance Criteria

- SHALL keep one clock (`useState(() => Date.now())` + `setInterval(…, 1000)` in `useEffect`), as `order.controller.ts`
- WHEN `timer` is non-null and seconds left is above 0 THEN the clock SHALL tick; otherwise no interval SHALL run
- WHEN seconds left reaches 0 THEN the interval SHALL be cleared and `timer.seconds` SHALL stay 0
- WHEN the controller unmounts THEN the interval SHALL be cleared
- WHEN the tab was in the background THEN the next tick SHALL show the true remaining time (each tick reads the clock)
- SHALL NOT call a service or use case from the clock effect

### Requirement 3: Time up: disable pay, ask the server

**User Story:**

AS a buyer whose 10 minutes ran out
I WANT "Bayar" to stop and the page to follow what the server says
SO THAT I never start a payment for a booking that is being cancelled, and never lose one the server still holds

#### Acceptance Criteria

- WHEN seconds left is 0 in a timer state THEN `timeUp` SHALL be true and `timer` SHALL stay `{ seconds: 0, label }`;
  otherwise `timeUp` SHALL be false
- WHEN the answer arrives with `expiresAt` at or before `serverNow` THEN `timeUp` SHALL be true at once
- WHEN `timeUp` THEN `pay.enabled` SHALL be false (when `pay` is non-null) and `pay.onPay` SHALL do nothing (no
  `mutate`, no new idempotency key)
- WHEN `timeUp` turns from false to true THEN the controller SHALL call `pageQuery.refetch()` once for that edge, so
  the server's answer decides: 409 `BOOKING_NOT_HELD` → the use case's `inactive` (existing message) or `paid`
  (existing leaving → e-ticket); a 200 with a later deadline re-anchors (Requirement 4)
- WHILE `verifying` THEN the status poll SHALL continue unchanged (4 s): a server `PAID` still leads to the e-ticket
- SHALL NOT switch to `inactive`, navigate, open a popup or show new copy on the client's own zero
- SHALL NOT build the expired screen or "Antre lagi" (FR-23-W1)

### Requirement 4: The countdown stays anchored to its answer

**User Story:**

AS a buyer
I WANT the countdown to resync whenever the page asks the server again
SO THAT it always reflects the server's latest times

#### Acceptance Criteria

- SHALL keep the anchor in controller state, written in render (React's "adjust state while rendering") only from a
  real `ready` answer: `view && !pageQuery.isPlaceholderData && pageQuery.dataUpdatedAt !== anchor?.receivedAt`
- WHEN a new real `ready` answer arrives (the time-up refetch, the error view's "Coba lagi", a reload) THEN the countdown
  SHALL re-anchor to its `expiresAt`, `serverNow` and `dataUpdatedAt`
- WHEN the query shows placeholder data THEN the anchor SHALL NOT change
- WHEN only the language changes THEN `timer.label` SHALL be retranslated without resetting the seconds (the page query
  key has no locale)
- SHALL read the countdown only from the anchor, never from `view.expiresAt` or `pageQuery.dataUpdatedAt` directly

### Requirement 5: States without a countdown

**User Story:**

AS a buyer on the loading, message or leaving view
I WANT no timer rather than a wrong one
SO THAT I never see "NaN:NaN" or a countdown for a booking that is done

#### Acceptance Criteria

- WHEN `state` is `loading`, `inactive`, `not-found`, `error` or `leaving` THEN `timer` SHALL be `null` and `timeUp`
  SHALL be false
- WHEN `expiresAt` or `serverNow` is missing or does not parse THEN `timer` SHALL be `null`, `timeUp` false, no interval
  SHALL run, and "Bayar" SHALL stay usable (the server still judges the deadline)
- SHALL NOT expose `NaN`, a negative or fractional number, ISO strings or `Date` objects

### Requirement 6: `payment_expired` analytics

**User Story:**

AS a product owner
I WANT to count buyers whose payment window ran out on the page
SO THAT the funnel shows where payments are lost (tracking plan §3 exits)

#### Acceptance Criteria

- WHEN `timeUp` first becomes true on this page visit THEN SHALL track `ANALYTICS_EVENTS.PAYMENT_EXPIRED`
  (`'payment_expired'`) with `{ booking_id: bookingId }`, the `snake_case` shape of `payment_failed`
- SHALL track it at most once per page visit (a ref), even if a refetch re-anchors and the timer reaches zero again
- SHALL NOT send names, NIKs, the order code, the snap token or e-mail

### Requirement 7: Interface, DI and tests

**User Story:**

AS a developer
I WANT the controller extended without breaking FR-20-W1 behaviour
SO THAT the page keeps working while the countdown arrives

#### Acceptance Criteria

- SHALL export `PaymentTimerView { seconds: number; label: string }` and add `timer: PaymentTimerView | null` and
  `timeUp: boolean` to `PaymentControllerInterface`
- SHALL NOT add a DI key, a query, a mutation or a popup; `PaymentControllerDeps` stays as it is
- SHALL keep every other field and behaviour unchanged (load, preload, pay, attempt key, poll, views, other analytics)
- SHALL add `timer: null` and `timeUp: false` to `base()` in `src/presentation/pages/Payment/__tests__/index.test.tsx`
  so `tsc --noEmit` passes (rendering is spec 80)
- SHALL replace the `not.toHaveProperty('timer')` assertion and test with fake timers: wrong device clock, elapsed since
  the answer, ticking, stop at 0 with `timeUp`, pay disabled and `onPay` a no-op at 0, the single refetch, re-anchor,
  `payment_expired` once, null states, `NaN` dates, interval cleared on unmount; coverage ≥ 85%
