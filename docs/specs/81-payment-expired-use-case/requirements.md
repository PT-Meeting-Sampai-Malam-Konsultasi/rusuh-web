# Requirements Document

## Introduction

Business logic for FR-23-W1 ("Web: Payment expired state and queue again", rusuh-web#22; parent FR-23: "Jika pembayaran
tidak selesai dalam 10 menit, booking dibatalkan, email 'pembayaran expired' dikirim, dan stok dilepas untuk antrian
berikutnya", MUST; BR-05). `payBookingUseCase` (spec 76) today ends every dead booking in `{ kind: 'inactive', refund }`,
which cannot tell an expired order from a cancelled one and carries neither the event (needed for "Antre lagi") nor the
number of held tickets (the HiFi body "3 tiket yang ditahan kami lepaskan"). This spec widens that outcome: on the
inactive path the use case reads the booking once (`bookingService.getBooking`, openapi `getBooking`) and returns
`reason`, `eventId` and `ticketCount`. Sources: ADR-0005 (server times), ADR-0009 (late payment flagged, `refund_required`),
ADR-0026 (hard deadline, sweeper cancels and releases), `analysis/requirements-review.md` A-10 / Q-26 ("queue again at the
back"), `analysis/hifi-api-review.md` H-4, HiFi `analysis/hifi/src/payment.html` 83–90, `openapi.yaml` `getPaymentPage`,
`startSnapPayment`, `getPaymentStatus`, `getBooking`.

No service or entity spec: `bookingService.getBooking` and `Booking` (`eventId`, `status`, `attendees`, `price`,
`expiresAt`, `serverNow`, `refundRequired`) already exist. Spec 82 maps the outcome to the screen; spec 83 renders it.

Out of scope: the expiry e-mail and refund processing (backend), any change to the countdown (FR-21-W1), the PAID path,
the `failed` / `verifying` steps.

## Glossary

| Term          | Definition                                                                                                                                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inactive path | Any branch that today returns `{ kind: 'inactive', refund }`: `settle` after a 409 `BOOKING_NOT_HELD` on `load` / `pay`, and `checkStatus` when the step is dead                                                        |
| Status        | The `PaymentStatusResponse` that led to the inactive path                                                                                                                                                               |
| Booking read  | One `bookingService.getBooking(bookingId)` call made only on the inactive path                                                                                                                                          |
| Expired       | The 10-minute window ran out: Status or Booking says `EXPIRED`, a late payment (`paid_after_expiry` / `refundRequired`), or the booking is still `PAYMENT_PENDING` / `HELD` with `expiresAt ≤ serverNow` (server times) |
| Other         | Not payable for any other reason: `CANCELLED`, back in `SELECTION`, or not decidable                                                                                                                                    |
| Ticket count  | `booking.attendees.length`, else the sum of `price.lines[].quantity`; `null` when 0 or unknown                                                                                                                          |

## Requirements

### Requirement 1: One inactive outcome with reason, event and ticket count

**User Story:**

AS the payment page
I WANT to know why the order ended, for which event, and how many tickets it held
SO THAT I can show "Pesanan dibatalkan" with the right count and send the buyer back to that event's queue

#### Acceptance Criteria

- SHALL export `InactiveOutcome { kind: 'inactive'; refund: boolean; reason: 'expired' | 'other'; eventId: string | null; ticketCount: number | null }`
  and use it as the inactive member of `PaymentPageResult`, `PayResult` and `PaymentStep`
- WHEN the inactive path is reached THEN the use case SHALL make exactly one Booking read and return `eventId` =
  `booking.eventId` and `ticketCount` per the glossary
- SHALL set `reason: 'expired'` per the glossary's Expired row, else `'other'`
- SHALL set `refund` true WHEN `status.paymentStatus === 'paid_after_expiry'` OR `booking.refundRequired === true`
- SHALL compare `expiresAt` only with the Booking's own `serverNow` (never the device clock)
- SHALL NOT return sentences, e-mail addresses, names or NIKs

### Requirement 2: The Booking read may fail without losing the outcome

**User Story:**

AS a buyer whose order expired while the core service is slow
I WANT the page to still tell me the order is over
SO THAT I am not stuck on an error for a booking that is already gone

#### Acceptance Criteria

- WHEN the Booking read fails with 401 / `UNAUTHORIZED` THEN `load` and `pay` SHALL return `{ kind: 'unauthorized' }`
  and `checkStatus` SHALL re-throw (the controller's existing 401 → sign-in)
- WHEN it fails with anything else (404, 5xx, `NETWORK_ERROR`, `TIMEOUT`, unknown) THEN SHALL still return the
  `InactiveOutcome` with `eventId: null`, `ticketCount: null`, `refund` and `reason` from the Status alone
- SHALL NOT retry the Booking read

### Requirement 3: Call budget

**User Story:**

AS the operator during a flash crowd
I WANT the expired path to add at most one request
SO THAT expiry does not multiply load

#### Acceptance Criteria

- `load`: ready → 1 call; 409 then PAID → 2 (`getPaymentPage`, `getPaymentStatus`); 409 then dead → 3 (+ `getBooking`)
- `pay`: 409 then dead → `startSnap`, `getPaymentStatus`, `getBooking`; `snap.pay` is not called
- `checkStatus`: 1 call; 2 only when the step is inactive
- SHALL NOT call `getBooking` on `ready`, `paid`, `snap`, `retryable`, `not-found`, `failed` or `verifying`
- The interface docs (`load`, `pay`, `checkStatus`) SHALL state this budget

### Requirement 4: Existing behaviour unchanged; tests

**User Story:**

AS a developer
I WANT the widened outcome without regressions
SO THAT FR-20-W1 and FR-21-W1 keep working

#### Acceptance Criteria

- SHALL keep every non-inactive branch, `stepOf`'s order of checks and `ticketLines` unchanged
- SHALL add `bookingService` to the use case's `Pick<AwilixRegistry, …>`; no new `AwilixRegistry` key
- SHALL test every reason / refund branch, the failed Booking read (401 and non-401), the call budget per method, and
  that `getPaymentStatus` infrastructure errors still propagate; coverage ≥ 85%
