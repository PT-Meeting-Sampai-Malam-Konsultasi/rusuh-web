# Requirements Document

## Introduction

Page logic for FR-23-W1 ("Web: Payment expired state and queue again", rusuh-web#22; parent FR-23, MUST; BR-05).
`paymentController` gains an `expired` screen state and a translated `PaymentExpiredView` (HiFi
`analysis/hifi/src/payment.html` 83–90: stamp "Waktu habis", "Pesanan dibatalkan.", body with the held-ticket count, the
"Saldo terpotong?" note, "Antre lagi" + "Ke beranda") built from spec 81's `InactiveOutcome`. "Antre lagi" forgets this
device's ended turn for the event, tracks `queue_rejoin` and replaces the page with `/queue?event=<id>`: back of the queue,
no priority (A-10 / Q-26, `analysis/requirements-review.md`). Other dead bookings (`reason: 'other'`) keep the existing
generic `inactive` message. Sources: ADR-0005, ADR-0009 (late payment flagged for refund), ADR-0026 (server decides
expiry), `analysis/hifi-api-review.md` H-4 (refund is promised, not "otomatis"), `architecture/customer-journey.md`,
ADR-0014 (ID/EN).

Lifts spec 79's "SHALL NOT build the expired screen or 'Antre lagi' (FR-23-W1)" and spec 77/78's "FR-23-W1 builds the
full expired screen".

Out of scope: the expiry e-mail and refund processing (backend); any change to the countdown, its refetch at zero or
`payment_expired` (FR-21-W1, spec 79); `order_expired` (the order window, FR-18; spec 60 lists it with the order-timer
screens).

## Glossary

| Term          | Definition                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Outcome       | The `InactiveOutcome` (spec 81) from the page query (`pageQuery.data`) or the phase (pay / status poll)  |
| Seen order    | The last real `ready` answer of this page visit (`{ view, tickets }`), kept in controller state          |
| Expired state | `state === 'expired'`: an Outcome with `reason: 'expired'` (late payments included)                      |
| Turn          | This device's stored admission token and queue place for the event (`admissionStore`, `queuePlaceStore`) |

## Requirements

### Requirement 1: The expired state

**User Story:**

AS a buyer whose 10 minutes to pay ran out
I WANT a clear "order cancelled" screen
SO THAT I know my tickets were released and what to do next

#### Acceptance Criteria

- SHALL add `'expired'` to `PaymentScreenState`; WHEN the Outcome has `reason: 'expired'` THEN `state` SHALL be
  `'expired'`, `expired` SHALL be a `PaymentExpiredView` and `message` SHALL be `null`
- WHEN the Outcome has `reason: 'other'` THEN `state` SHALL stay `'inactive'` with the existing `message` and
  `expired: null`
- SHALL reach the expired state from every source: the first load (409 on `getPaymentPage`), the FR-21 refetch at zero,
  a 409 on "Bayar", and a dead status poll step
- SHALL keep the state order: `not-found` (no param) → `loading` → `error` → `not-found` → `expired` / `inactive` →
  `leaving` → …
- SHALL set `expired.stamp`, `title`, `queueAgainLabel`, `homeLabel` from `payment_expired_stamp`,
  `payment_expired_title`, `payment_expired_queue_again`, `action_back_home`; `homeHref` = `ROUTES.HOME`

### Requirement 2: The body with the held-ticket count

**User Story:**

AS a buyer
I WANT to see how many tickets were released
SO THAT the message matches my order

#### Acceptance Criteria

- SHALL use `count = outcome.ticketCount ?? seen order's tickets.length` (ignored when 0)
- WHEN `count` is known THEN `body` SHALL be `t('payment_expired_body', { count })` (i18next plurals: `_one` / `_other`)
- WHEN it is not THEN `body` SHALL be `t('payment_expired_body_unknown')` (no number)

### Requirement 3: The refund note and the e-mail

**User Story:**

AS a buyer who may have paid at the last second
I WANT to know whether my money comes back and where the details go
SO THAT I do not panic or pay twice

#### Acceptance Criteria

- WHEN `outcome.refund` THEN `noteLead` SHALL be `null` and `note` SHALL be `t('payment_inactive_refund')` (H-4 text,
  already starts with "Saldo terpotong?")
- OTHERWISE `noteLead` SHALL be `t('payment_expired_note_lead')` and `note` the conditional text:
  `t('payment_expired_note_email', { email })` WHEN the seen order has a non-empty `view.customerEmail`, else
  `t('payment_expired_note_account')`
- SHALL NOT take an e-mail from anywhere but the seen order's `customerEmail`; SHALL NOT log or track it
- SHALL NOT say the refund is automatic (H-4, ADR-0009)

### Requirement 4: "Antre lagi"

**User Story:**

AS a buyer whose order expired
I WANT to queue again for the same event
SO THAT I can still try, at the back of the line like everyone else (A-10)

#### Acceptance Criteria

- WHEN `outcome.eventId` is known THEN `onQueueAgain` SHALL be a function; otherwise `null` (the page hides the button)
- WHEN `onQueueAgain` is called THEN SHALL, once per page visit (a ref): `endOrderWindowUseCase.execute(eventId)`, then
  `trackEvent(ANALYTICS_EVENTS.QUEUE_REJOIN, { eventId, from: 'payment' })`, then
  `router.replace(withQuery(ROUTES.QUEUE, { event: eventId }))`
- SHALL NOT forget the turn on display or on "Ke beranda"; SHALL NOT ask for a priority place

### Requirement 5: What the expired screen hides and keeps

**User Story:**

AS a buyer on the expired screen
I WANT no timer and no pay button
SO THAT nothing suggests the order can still be paid

#### Acceptance Criteria

- WHEN `state` is `expired` THEN `timer` SHALL be `null`, `timeUp` false, `intro`, `pay`, `notice`, `progress` `null`
- WHEN `state` is `expired` and a seen order exists THEN `summary` SHALL be built from it (HiFi keeps the aside); WHEN no
  seen order exists (first load already expired) THEN `summary` SHALL be `null`
- SHALL NOT poll, open Snap or refetch from the expired state

### Requirement 6: Analytics

**User Story:**

AS a product owner
I WANT re-queues from payment counted once and expiries not counted twice
SO THAT the funnel stays honest

#### Acceptance Criteria

- SHALL track `queue_rejoin` per Requirement 4 only
- SHALL NOT track `payment_expired` (FR-21-W1 already sends it at the countdown's zero) or `order_expired`
- SHALL NOT send e-mail, names, NIKs, order code or snap token

### Requirement 7: Interface, DI and tests

**User Story:**

AS a developer
I WANT the controller extended without breaking FR-20-W1 / FR-21-W1
SO THAT the page keeps working

#### Acceptance Criteria

- SHALL export `PaymentExpiredView`, add `expired: PaymentExpiredView | null` to `PaymentControllerInterface` and
  `endOrderWindowUseCase` to `PaymentControllerDeps`; no new `AwilixRegistry` key, query or mutation
- SHALL carry the Outcome in the phase (`{ kind: 'inactive'; outcome: InactiveOutcome }`)
- SHALL add `expired: null` to `base()` in `src/presentation/pages/Payment/__tests__/index.test.tsx`
- SHALL test every source of the expired state, the count / note / e-mail branches, "Antre lagi" order and once-only,
  `reason: 'other'` unchanged, hidden fields, and no `payment_expired` from this path; coverage ≥ 85%
