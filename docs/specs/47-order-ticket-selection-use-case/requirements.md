# Requirements Document

## Introduction

The business rules behind FR-13-W1 (rusuh-web#13, parent FR-13 "Customer dapat membeli tiket maksimal 3 (gabungan
seluruh kategori), dibatasi berdasarkan NIK …"): how many tickets the buyer may pick, how the picks become one ticket
slot each, how typed holder values survive quantity changes, and that "Saya sendiri" (Myself) may be used on one ticket
only. Sources: ADR-0007 ("Order: 1–3 tickets. Each ticket carries an attendee NIK and name"; "Within one order, every NIK
must be different"), ADR-0004 (reservation of `min(3, remaining)`), `analysis/hifi-api-review.md` §4 "Ticket limit"
and H-2, `openapi.yaml` `getCategories` / `createBooking` (`tickets` `maxItems: 3`), and the core-use-case rule, which
names these two rules as use-case logic. Pure TypeScript; no API call.

## Glossary

| Term         | Definition                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| Order limit  | `min(3, maxTicketsPerOrder, reservedUnits)`; 3 is `createBooking.tickets.maxItems` (N-1)              |
| Quantities   | Tickets picked per `categoryId`; a missing key means 0                                                |
| Total        | Sum of quantities over the categories of the current response                                         |
| Ticket slot  | One ticket of the order: its category, its ordinal in that category and its running index ("Tiket n") |
| Slot key     | `${categoryId}-${ordinal}`; stable while the slot exists, so typed holder values follow their ticket  |
| Holder entry | The values typed for one slot: `holderType`, `fullName`, `nik`                                        |
| Holder type  | `'self'` ("Saya sendiri": the signed-in buyer; name from the profile) or `'other'` ("Orang lain")     |
| Profile name | `User.fullName` from `getMe`, trimmed; may be empty                                                   |

## Requirements

### Requirement 1: Order limit

**User Story:**

AS a buyer whose turn came
I WANT the steppers to stop at the number of tickets my admission really allows
SO THAT I do not fill in holders for tickets the hold will refuse

#### Acceptance Criteria

- SHALL compute the order limit as the minimum of 3, `maxTicketsPerOrder` and `reservedUnits`
- WHEN `maxTicketsPerOrder` or `reservedUnits` is not a whole number ≥ 0 (missing, `NaN`, negative, fractional) THEN
  SHALL ignore that value and use the others (the hold re-checks with `QUANTITY_OVER_RESERVATION`)
- WHEN `reservedUnits` is 1 or 2 (near sell-out, ADR-0004) THEN the limit SHALL be 1 or 2
- SHALL NOT read stock or availability to change the limit (FR-14-W1)

### Requirement 2: Quantities per category

**User Story:**

AS a buyer
I WANT to add and remove tickets per category within the limit
SO THAT I can mix categories (e.g. 2 × Festival B + 1 × Tribun Atas) up to my limit

#### Acceptance Criteria

- SHALL allow an increment on a category only WHEN the total is below the limit and the category is in the current
  response
- SHALL allow a decrement on a category only WHEN that category's quantity is above 0
- WHEN a change is not allowed THEN SHALL return an `unchanged` result with a reason code (`LIMIT_REACHED`,
  `NONE_TO_REMOVE`, `UNKNOWN_CATEGORY`) and leave the quantities as they were
- SHALL never produce a negative quantity or a total above the limit
- SHALL report, per category in server order, the quantity, whether increment is allowed and whether decrement is
  allowed, plus the total
- SHALL ignore quantities whose `categoryId` is not in the current response when computing the total and the slots
- SHALL NOT mutate the quantities passed in
- SHALL NOT block sold-out categories (FR-14-W1)

### Requirement 3: Ticket slots

**User Story:**

AS a buyer
I WANT one holder block per ticket, labelled with its number and category
SO THAT I know whose name and NIK go on which ticket

#### Acceptance Criteria

- SHALL derive one slot per picked ticket, ordered by category server order and then by ordinal within the category
- SHALL give each slot `index` 1..total (the running "Tiket n"), `ordinal` 1..quantity within its category,
  `categoryId`, `categoryName` and `key` `${categoryId}-${ordinal}`
- WHEN the quantities are all 0 THEN SHALL return no slots
- SHALL NOT include translated text: the label "Tiket n · <category>" is built by the controller

### Requirement 4: Holder values survive quantity changes

**User Story:**

AS a buyer who has typed a holder name and NIK
I WANT them to stay on their ticket when I add or remove another ticket
SO THAT I never retype or, worse, see my values move to a different ticket

#### Acceptance Criteria

- WHEN the slots change THEN SHALL return one holder entry per slot, in slot order, keeping the entry whose `slotKey`
  matches and dropping entries whose slot no longer exists
- SHALL start every new slot as `{ holderType: 'other', fullName: '', nik: '' }`
- WHEN a ticket is removed from category B THEN the entries of category A SHALL keep their values (keys are per
  category, so A's keys do not change)
- WHEN a ticket is added to an earlier category THEN later slots SHALL keep their values even though their running
  index changes
- WHEN the slot holding `self` is removed THEN no slot SHALL be `self`, so "Saya sendiri" becomes available again
- SHALL NOT mutate the entries passed in

### Requirement 5: "Saya sendiri" on one ticket only (block)

**User Story:**

AS a buyer
I WANT "Saya sendiri" to be usable on one ticket only
SO THAT I cannot put my own identity on two tickets (1 NIK = 1 seat per event, ADR-0007)

#### Acceptance Criteria

- SHALL allow `self` on a slot only WHEN no other slot is `self` (block, not move: the buyer first switches the current
  `self` slot to "Orang lain")
- WHEN `self` is requested while another slot is `self` THEN SHALL return `unchanged` with reason `SELF_TAKEN`
- WHEN `self` is requested and the profile name is empty THEN SHALL return `unchanged` with reason `NO_PROFILE_NAME`
- WHEN a slot becomes `self` THEN its `fullName` SHALL be the trimmed profile name and its `nik` SHALL stay as it was
  (the account holds no NIK, ADR-0007)
- WHEN a slot goes from `self` to `other` THEN its `fullName` SHALL be cleared and its `nik` SHALL stay as it was
- WHEN the requested type equals the current one or the slot key is unknown THEN SHALL return `unchanged`
  (`SAME_TYPE` / `UNKNOWN_SLOT`)
- SHALL expose whether `self` may be chosen for a given slot, for the disabled option
- SHALL NOT validate NIK format, duplicates or Dukcapil (FR-15-W1)

### Requirement 6: Pure, registered, tested

**User Story:**

AS a developer
I WANT these rules in one stateless core use case
SO THAT the controller stays free of business logic and the rules are tested without React

#### Acceptance Criteria

- SHALL live in `src/core/use_case/booking/order-ticket-selection.use-case.ts` with zero React, Next.js, browser or
  infrastructure imports
- SHALL return discriminated unions with reason codes for refused changes; SHALL NOT throw for an expected outcome
- SHALL be registered as `orderTicketSelectionUseCase: asFunction(OrderTicketSelectionUseCase).singleton()` in
  `services.registry.ts`, added to `AwilixRegistry` and to `KEYS` in `src/infrastructure/di/__tests__/registry.test.ts`
- SHALL have tests for every branch with coverage ≥ 85%
