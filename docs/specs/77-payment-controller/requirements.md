# Requirements Document

## Introduction

Page logic for FR-20-W1 (rusuh-web#19, "Web: Payment page and Midtrans Snap (snap.js)"; parent FR-20,
rusuh-documentation#20; T-07: Midtrans). `paymentController` reads `?booking=`, loads the payment view through
`payBookingUseCase.load` (spec 76), preloads snap.js, runs "Bayar" as one mutation around `payBookingUseCase.pay`
(reuse the live attempt, or start one with an idempotency key it owns), polls `checkStatus` every 4 s while verifying,
moves to the e-ticket only when the server says PAID, offers "Bayar lagi" (a new attempt) after a failure, and maps
every outcome to translated views and analytics (`add_payment_info`, `purchase`, `payment_failed`). Sources:
`openapi.yaml` (`getPaymentPage`, `startSnapPayment`, `getPaymentStatus` "every 3–5 s"), ADR-0008, LLD-03 §4.3 (redirect
/ callback is never confirmation), §4.4, §5.2, `customer-journey.md` §8, §9, §11 (I13 poll, M1 success page),
`hifi-api-review.md` H-3, H-4, HiFi `analysis/hifi/src/payment.html`, `docs/specs/60-analytics-funnel-events` ("purchase
is sent from the payment result"), `.claude/rules/presentation.md` route table (`/payment?booking=`,
`/tickets/detail?booking=`).

Out of scope (deferred, named so nobody builds them here): the 10-minute countdown and its warning (FR-21-W1 /
BR-05-W1), the expired "Pesanan dibatalkan / Antre lagi" screen (FR-23-W1; this page shows a plain "no longer active"
state with a link home), resume after refresh beyond reloading `/payment?booking=` (NFR-02-W1), an in-page method
picker (H-3), `payment_expired` / `order_expired` analytics (with FR-21 / FR-23).

## Glossary

| Term    | Definition                                                                                  |
| ------- | ------------------------------------------------------------------------------------------- |
| Phase   | Controller state after the load: `ready`, `verifying`, `failed`, `busy`, `inactive`, `paid` |
| Attempt | `{ key, reusable }` in a ref: the idempotency key and the transaction "Bayar" reopens       |
| Hint    | How the last Snap popup ended (`success`, `pending`, `error`), passed to `checkStatus`      |
| Leaving | PAID was seen; the page is replacing itself with the e-ticket                               |

## Requirements

### Requirement 1: Load and page states

**User Story:**

AS a buyer arriving from the order page
I WANT my order shown, or a clear reason why it can't be paid
SO THAT I never pay for the wrong or a dead order

#### Acceptance Criteria

- SHALL read `booking` with `useSearchParamsNext().get('booking')?.trim() ?? ''`; WHEN empty THEN `state` SHALL be
  `not-found` without a call
- SHALL load with one `useQueryTanstack` (`queryKey: [QUERY_KEYS.PAYMENT, bookingId]`, `retry: false`,
  `refetchOnWindowFocus: false`) around `payBookingUseCase.load`
- SHALL expose `state`: `loading` while the query loads; `error` on a rethrown failure (with `retry` refetching and a
  translated `message`); `not-found`; `inactive` (with the refund note when `refund`); `leaving` for `paid`; else the
  phase (`ready`, `opening` while paying, `verifying`, `failed`, `busy`)
- WHEN the load result is `unauthorized` (or a 401) THEN SHALL `router.replace('/login?next=' + '/payment?booking=<id>')`
- WHEN the load result is `paid` THEN SHALL `router.replace('/tickets/detail?booking=<id>')`
- SHALL track `trackPageView('payment')` once on mount
- SHALL NOT render, compute or expose a countdown (FR-21-W1)

### Requirement 2: Pay

**User Story:**

AS a buyer
I WANT one "Bayar" that opens Midtrans
SO THAT I can pick the method there and pay

#### Acceptance Criteria

- SHALL preload snap.js once the view is ready with one `useQueryTanstack` (`queryKey: [QUERY_KEYS.SNAP_SCRIPT]`,
  `queryFn: async () => { await snap.load(); return true; }`, `staleTime: Infinity`, `retry: false`); a failed preload
  SHALL change nothing visible (the tap retries the load)
- SHALL run "Bayar" in one `useMutationTanstack` (`mutationKey: [MUTATION_KEYS.PAYMENT_PAY]`, `retry: false`) around
  `payBookingUseCase.pay({ bookingId, idempotencyKey, reusable })`
- SHALL keep the attempt in a ref: the key is a `randomUuid()` made on the first tap; `reusable` starts as
  `view.currentSnap ?? null`, becomes the transaction of every `snap` / `retryable` result, and SHALL be reset (new key,
  `reusable: null`) only when a status poll returns `failed`
- SHALL ignore a tap while the mutation is pending (a ref guard set synchronously in the handler)
- SHALL NOT use the global loading overlay for this mutation (the Snap popup sits over the page); `pay.busy` SHALL carry
  the pending state
- Results: `snap` `success` / `pending` / `error` → phase `verifying` with that hint; `snap` `closed` → phase `ready`;
  `paid` → leaving; `inactive` → phase `inactive`; `retryable` → phase `busy` with its code; `not-found` → `not-found`;
  `unauthorized` → sign-in; `onError` → popup `t(ERROR_CODE_MAP[code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR)` with `reference:
requestId`, phase unchanged; a 401 in `onError` → sign-in

### Requirement 3: Follow the server status

**User Story:**

AS a buyer back from Midtrans
I WANT the page to wait for the real confirmation
SO THAT I get my e-tickets exactly when the payment is confirmed

#### Acceptance Criteria

- SHALL poll with one `useQueryTanstack` (`queryKey: [QUERY_KEYS.PAYMENT_STATUS, bookingId, hint]`, `queryFn: () =>
payBookingUseCase.checkStatus(bookingId, hint)`, `enabled` only in phase `verifying`, `refetchInterval: 4000`,
  `refetchOnWindowFocus: true`, `retry: false`)
- WHEN a step arrives THEN: `paid` → leaving + `router.replace('/tickets/detail?booking=<id>')`; `verifying` → keep
  polling with its `reason`; `failed` → phase `failed` and a new attempt (new key, `reusable: null`); `inactive` → phase
  `inactive` with `refund`
- WHEN a poll fails with 401 THEN SHALL go to sign-in; other poll errors SHALL be ignored (the interval keeps going)
- SHALL handle each step once (a ref of the last handled `dataUpdatedAt`)
- SHALL NOT mark paid, navigate or track `purchase` from a Snap callback

### Requirement 4: Views

**User Story:**

AS a buyer
I WANT the order, the pay action and the state of my payment in my language
SO THAT I know what I pay and what happens next

#### Acceptance Criteria

- `steps`: "Pilih tiket" done, "Bayar" current, "E-tiket" (`done` / `current` flags)
- `summary` (non-null when a view is loaded and state is `ready`, `opening`, `verifying`, `failed`, `busy` or
  `leaving`): heading "Pesanan" + order code; event line `"SAMUDRA · Sab, 12 Des 2026 · GBK"` (upper-case name, date in
  the view's `timezone`, venue; missing parts left out); one line per ticket (category, `NIK <nikMasked>`, unit price or
  '' when unknown); "Biaya layanan" once with the view's `adminFee`; "Total"; the Midtrans legal note
- `pay` (non-null in `ready`, `opening`, `failed`, `busy`, and `verifying` with reason `waiting`): label by state
  ("Bayar", "Bayar lagi", "Coba lagi", "Buka lagi pembayaran"), dock label "Bayar Rp X" in those states with the amount,
  `busyLabel`, `busy`, `enabled`, `onPay`
- `notice`: `failed` → the failed copy (error tone); `busy` → `t(ERROR_CODE_MAP[code] ?? …UNKNOWN_ERROR)` (error tone);
  else null
- `progress` (verifying and leaving): title, body and the "tickets stay held" line for `confirming` / `waiting`, the
  paid copy for `leaving`
- `message` (inactive / not-found / error): title, body, refund note (inactive with refund only, H-4 "akan kami
  kembalikan"), retry action (error only), home link
- Money with `formatRupiah(amount, locale)`, dates with a new pure `formatEventDay` (`Sab, 12 Des 2026` / `Sat, 12 Dec
2026`), both locales; every text through `t`

### Requirement 5: Analytics

**User Story:**

AS a product owner
I WANT the payment steps of the funnel measured
SO THAT we see how many buyers open Snap, pay, or fail

#### Acceptance Criteria

- SHALL track `add_payment_info` once per opened attempt (`attemptId`) on a `snap` result: `booking_id`, `currency`,
  `value` (total), `payment_type: 'midtrans_snap'`, `items` from `price.lines`
- SHALL track `purchase` once when a poll returns `paid` with a loaded view: `transaction_id` and `booking_id` (the
  booking id), `currency`, `value`, `items`
- SHALL track `payment_failed` on each `failed` step: `booking_id`, `reason` (the `paymentStatus`)
- SHALL NOT send names, NIKs, the order code's holder data, the snap token or e-mail

### Requirement 6: Registration and tests

**User Story:**

AS a developer
I WANT the controller registered for its page only and fully tested
SO THAT the shell can resolve it and every path is pinned

#### Acceptance Criteria

- SHALL live in `src/controllers/payment.controller.ts` (default export), registered as `paymentController:
asFunction(PaymentController)` (no `.singleton()`) as the **first** `register` call in
  `src/infrastructure/di/controllers/payment.ts`, typed in `AwilixRegistry`, in `KEYS`
- SHALL test the returned interface per state, the attempt key reuse and renewal, the guard, every mutation result and
  poll step, navigation targets, the popup mapping, analytics params, and both locales' formatting
- SHALL keep coverage ≥ 85%
