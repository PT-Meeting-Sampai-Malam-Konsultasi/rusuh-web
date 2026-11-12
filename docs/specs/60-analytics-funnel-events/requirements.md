# Requirements Document

## Introduction

Part 1 of NFR-09-W2 (rusuh-web#72): the web sends the shared tracking plan's events
(`rusuh-documentation/tech/analytics-tracking-plan.md`) through the existing analytics adapter, so the same funnel as
Android exists before GA4 is connected. Until then the events reach Sentry as breadcrumbs.

## Requirements

### Requirement 1: Names and parameters

- Event names SHALL come from one list mirroring the plan (`src/utils/analytics.ts`); parameters in `snake_case`
- Every event SHALL carry `language`; no personal data (no e-mail, name, NIK, tokens)
- Positions and waits SHALL be ranges (`position_bucket`, `wait_bucket`); money in whole rupiah with `currency: IDR`

### Requirement 2: Events per screen

| Screen       | Events                                                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Home         | `view_item_list` once per visit; `select_item` on an event                                                                                                                                                                                       |
| Waiting room | `queue_join` (outcome incl. `no_queue`, `position_bucket`); `queue_turn` (`wait_bucket`, not without a queue); `queue_claim` (`admitted` · `missed` · `sold_out` · `paused`); `queue_leave`; `queue_rejoin` (`missed` · `left`); `sold_out_seen` |
| Sign in      | `login` / `sign_up` (`method: email_code`, `from`)                                                                                                                                                                                               |
| Order        | `view_item` once; `add_to_cart` after the count settles for 1 s (not for an empty cart); `holders_complete` once per set of tickets; `nik_rejected` (reason only); `sold_out_seen` when every category is sold out                               |
| E-ticket     | `view_ticket` once per booking; `ticket_download` (`pdf_print`); `ticket_add_calendar` (`via`)                                                                                                                                                   |

### Requirement 3: Not yet

- `begin_checkout`, `add_payment_info`, `purchase`, `payment_failed`, `payment_expired`, `order_expired`: with the
  booking, payment and order-timer screens. `purchase` is sent from the payment result, not the e-ticket page (which is
  also reached later from My tickets).
