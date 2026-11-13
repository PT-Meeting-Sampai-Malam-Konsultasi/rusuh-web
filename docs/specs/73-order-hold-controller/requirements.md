# Requirements Document

## Introduction

Page logic for FR-16-W1 (rusuh-web#78, "Web: Order: hold tickets and continue to payment"; parent FR-16,
rusuh-documentation#16). `orderController` gains the order summary (one line per category, "Biaya layanan" once per
order, total, the 10-minute hold note), the "Lanjut ke pembayaran" action with its enabled / busy / hint state, one
TanStack mutation around `holdBookingUseCase.execute` (spec 72), the attempt bookkeeping (idempotency key per selection,
known `bookingId` after a half-done attempt), the field / category marking for hold errors, a guard that keeps the
time's-up sheet away once the hold succeeded, analytics, and the navigation to `/payment?booking=<id>`. Sources:
`customer-journey.md` F20 ("Show breakdown: tickets + Biaya layanan = total, fixed fee per order"), F15, G0–G10, H0–H1;
ADR-0005 (5 min order, then 10 min to pay), ADR-0010, `hifi-api-review.md` H-1; HiFi `analysis/hifi/src/detail.html`
lines 46–56; `.claude/rules/presentation.md` route table (`/payment`, search param `booking`).

The `/payment` page is FR-20-W1 (rusuh-web#19) and is not built yet: until it merges, a successful hold navigates to the
not-found page. That is expected for this ticket.

## Glossary

| Term      | Definition                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| Summary   | The "Ringkasan" aside (desktop) and the sticky dock (phone) of the order page                                     |
| Checkout  | The "Lanjut ke pembayaran" action: label, enabled, busy, hint, handler                                            |
| Attempt   | `{ signature, idempotencyKey, bookingId }` for one selection; the signature is the tickets' category + token list |
| Leaving   | The hold succeeded and the page is navigating to `/payment`; nothing on the page reacts any more                  |
| Hold flag | A category the hold refused (sold out / over reservation) or a NIK conflict without a known slot                  |

## Requirements

### Requirement 1: Summary view

**User Story:**

AS a buyer
I WANT to see what I'm about to pay before I continue
SO THAT the total has no surprises (F20)

#### Acceptance Criteria

- SHALL expose `summary: OrderSummaryView | null`, non-null exactly when `status === 'ready'`, `totalTickets ≥ 1` and
  `timeUp` is false
- SHALL price it with `holdBookingUseCase.quote(ok.categories, quantities, ok.adminFee.amount)` and format every amount
  with `formatRupiah(amount, locale)`
- SHALL give one line per selected category in category order, labelled `t('order_summary_line', { quantity, category })`
  ("2 × Festival B"), with its line total
- SHALL show `t('order_summary_fee')` with the admin fee **once per order** (ADR-0010), `t('order_summary_total')` with
  the total, `t('order_summary_heading')`, `t('order_summary_note')` and `t('order_summary_tickets', { count })` for the
  dock
- SHALL NOT multiply the fee by the number of tickets (HiFi H-1)

### Requirement 2: Checkout state

**User Story:**

AS a buyer
I WANT the continue button enabled only when the order can be held, and told why when it can't
SO THAT I don't tap into an error

#### Acceptance Criteria

- SHALL expose `checkout: OrderCheckoutView | null`, non-null exactly when `summary` is
- `checkout.enabled` SHALL be true only when status is ready, tickets ≥ 1, `allHoldersVerified`, the order window has
  time left, no hold is in flight, the page is not leaving, and no hold flag blocks (a sold-out flagged category still
  selected, or an over-reservation flag)
- WHEN not enabled and not busy THEN `checkout.hint` SHALL say why, first match: the sold-out flag
  (`order_hold_sold_out`, category name), the over-reservation flag (`order_hold_over_reservation`), a NIK conflict
  without a slot (`error_nik_seat_taken` / `error_duplicate_nik` / `error_attendee_not_validated`), holders not all
  verified (`order_checkout_hint_holders`); `null` otherwise
- `checkout.busy` SHALL be true while the hold is in flight and while leaving
- SHALL label it `order_checkout_label` ("Lanjut ke pembayaran") and `order_checkout_short_label` ("Lanjut bayar") for
  the dock

### Requirement 3: The hold mutation

**User Story:**

AS a buyer
I WANT one tap to hold my tickets and open the payment page
SO THAT my tickets are reserved for 10 minutes while I pay

#### Acceptance Criteria

- SHALL run `holdBookingUseCase.execute` in one `useMutationTanstack` with `mutationKey: [MUTATION_KEYS.ORDER_HOLD]`
  and `retry: false`
- SHALL build the tickets in slot order from the slots' valid NIK checks (`validationToken` of a `done` / `valid` run
  whose values match the form) and the last 4 form NIK digits
- SHALL keep one attempt per selection signature: a new `randomUuid()` idempotency key when the signature changes; the
  same key and the known `bookingId` on a retry of the same selection
- SHALL read the admission token with `admissionStore.get(eventId)` at tap time
- SHALL call `toggleLoading()` in `mutationFn`, `onSuccess` and `onError`
- SHALL ignore a tap while a hold is in flight or the page is leaving (a ref guard set synchronously in the handler, so a
  double tap in one frame sends one request)
- WHEN the result is `held` THEN SHALL mark the page as leaving, block every later admission redirect, track
  `order_hold_created` and `router.push(withQuery(ROUTES.PAYMENT, { booking: bookingId }))`
- SHALL NOT store the Snap token, the booking or the validation tokens anywhere outside React state

### Requirement 4: Hold outcomes on the page

**User Story:**

AS a buyer whose hold did not go through
I WANT the page to show what went wrong, where
SO THAT I can fix it and continue within my time

#### Acceptance Criteria

- `nik-conflict` with slot indexes SHALL set those slots' check runs to `seat-taken` / `duplicate` (the existing field
  errors, "Gunakan NIK pemegang lain."), which also turns `allHoldersVerified` false
- `nik-conflict` without indexes and `attendees-stale` SHALL set every slot's run to `failed` with code
  `ATTENDEE_NOT_VALIDATED` (field error + "Periksa lagi") and set the hint to the conflict's message
- `sold-out` and `over-reservation` SHALL refetch the categories and set the hold flag (category name in the hint); the
  flag SHALL clear when the quantities change
- `active-booking` SHALL open the popup `error_account_has_active_booking`; WHEN its status is PAYMENT_PENDING THEN with
  the action `order_hold_open_active` that goes to that booking's payment page
- `not-held` SHALL open the popup `error_booking_not_held` and start the next tap as a new attempt
- `admission-invalid` SHALL `router.replace` to `/queue?event=<id>` once (the existing redirect guard)
- `unauthorized` and an `onError` 401 SHALL `router.push` to `/login?next=/order?event=<id>`
- `retryable` SHALL open the popup with `t(ERROR_CODE_MAP[code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR)`, `reference:
requestId`, and the action `action_retry` that runs the latest checkout handler; the known `bookingId` SHALL be kept
- `onError` (rethrown errors) SHALL open the popup with the mapped message and `reference: error.requestId`
- SHALL NOT call `analyticsAdapter.reportError` for hold errors and SHALL NOT put names, NIKs, validation tokens or the
  booking id in analytics

### Requirement 5: Time's-up guard

**User Story:**

AS a buyer whose hold just succeeded
I WANT no "5 menit sudah lewat" while the payment page opens
SO THAT I'm not told my order is gone when it's held

#### Acceptance Criteria

- SHALL NOT latch `expired` while the hold is in flight or after a `held` result (leaving)
- WHEN the window reaches zero while a hold is in flight and the hold then fails THEN the sheet SHALL show on that render
- SHALL NOT run `endOrderWindowUseCase` after a `held` result (the payment page still needs the admission token)

### Requirement 6: Analytics and tests

**User Story:**

AS a product owner
I WANT the funnel step measured
SO THAT we can see how many buyers reach payment and why holds fail

#### Acceptance Criteria

- SHALL track `order_continue_tapped` `{ eventId, tickets }` on an accepted tap, `order_hold_created` `{ eventId, tickets,
resumed }` on `held`, and `order_hold_failed` `{ eventId, outcome, code? }` on every other result and on `onError`
- SHALL test the returned interface, the loading toggle in all three paths, every outcome's marking / popup /
  navigation, the attempt key reuse and renewal, the double-tap guard, the time's-up guard, and analytics
- SHALL keep every existing `OrderController` test green and the controller's coverage ≥ 85%
