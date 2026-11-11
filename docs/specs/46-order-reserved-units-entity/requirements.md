# Requirements Document

## Introduction

Contract fix for FR-13-W1 (rusuh-web#13, parent FR-13 "Customer dapat membeli tiket maksimal 3 (gabungan seluruh
kategori) …"): the order limit is `min(maxTicketsPerOrder, reservedUnits)` (`analysis/hifi-api-review.md` §4 "Ticket
limit", ADR-0004 "reserving `min(3, remaining)`"), but the web types still call the reservation field `maxTickets`.
`openapi.yaml` `getCategories` names it `reservedUnits` ("Units reserved for this admission (1-3, ADR-0004); the order
may not exceed it."). This spec renames the field in the booking entity, the categories use case, the MSW mock and their
tests, so the selection rules (spec 47) read the field the server sends. No new service: `bookingService.getCategories`
and `accountService.getMe` already exist.

## Glossary

| Term                 | Definition                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `reservedUnits`      | `getCategories` 200 field: units the admission reserved for this buyer, 1–3 (ADR-0004); the order may not exceed it |
| `maxTicketsPerOrder` | `getCategories` 200 field: the policy maximum per order (N-1), 3 today                                              |
| Drift                | A web type whose field name differs from `openapi.yaml`                                                             |
| Order limit          | `min(maxTicketsPerOrder, reservedUnits)`; computed in spec 47, not here                                             |

## Requirements

### Requirement 1: Booking entity matches the contract

**User Story:**

AS a developer
I WANT `GetCategoriesResponse` to carry `reservedUnits` exactly as `openapi.yaml` names it
SO THAT the order limit reads the value the server actually sends

#### Acceptance Criteria

- SHALL rename `GetCategoriesResponse.maxTickets` to `reservedUnits: number` in
  `src/core/entities/booking/booking.entity.ts`, documented as "Units reserved for this admission, 1–3 (ADR-0004); the
  order may not exceed it."
- SHALL keep `reservedUnits` required (the contract lists it in `required`)
- SHALL correct the comment's ADR reference to ADR-0004 (ADR-0024 does not exist in `../rusuh-documentation/adr/`)
- SHALL keep every other field of `GetCategoriesResponse` and `Category` unchanged
- SHALL NOT add runtime code or imports other than `import type` to the entity file

### Requirement 2: Categories use case passes `reservedUnits` through

**User Story:**

AS the order controller
I WANT `OrderCategoriesResult` to expose `reservedUnits`
SO THAT the selection rules can cap the steppers at the reservation

#### Acceptance Criteria

- SHALL rename `maxTickets` to `reservedUnits` in the `kind: 'ok'` branch of `OrderCategoriesResult` in
  `src/core/use_case/booking/get-order-categories.use-case.ts`, copying `data.reservedUnits`
- SHALL keep the use case's other behaviour unchanged (missing token → `admission-invalid` without a request,
  `ADMISSION_INVALID` classified, everything else re-thrown)
- SHALL update `__tests__/get-order-categories.use-case.test.ts` fixtures and expectations to `reservedUnits`
- SHALL NOT compute the order limit here (spec 47 owns it)

### Requirement 3: Mock and fixtures follow the contract; queue drift left for a follow-up

**User Story:**

AS a developer running the app on MSW
I WANT the mocked `getCategories` response to match the contract
SO THAT local runs and tests exercise the same field the real API sends

#### Acceptance Criteria

- SHALL return `reservedUnits: 3` (not `maxTickets`) from the `getCategories` handler in
  `src/infrastructure/mocks/handlers/booking.handlers.ts` and update
  `src/infrastructure/mocks/__tests__/booking.handlers.test.ts`
- SHALL update the `OrderCategoriesResult` fixture in `src/controllers/__tests__/order.controller.test.ts`
- WHEN the rename is done THEN `grep -rn "maxTickets\b"` under `src/` SHALL match only the queue `Admission` files
  (`src/core/entities/queue/queue.entity.ts`, `queue.handlers.ts`, and their tests)
- SHALL NOT change `Admission.maxTickets` or any queue file: the same drift exists there (`openapi.yaml` `Admission`
  requires `reservedUnits`) and is recorded as a follow-up
