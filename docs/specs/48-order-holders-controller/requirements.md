# Requirements Document

## Introduction

Page logic for FR-13-W1 (rusuh-web#13, "Web: Order: 1–3 tickets, a holder (name + NIK) per ticket, 'Myself' option";
parent FR-13 "Customer dapat membeli tiket maksimal 3 (gabungan seluruh kategori), dibatasi berdasarkan NIK …").
`orderController` gains per-category steppers capped at `min(maxTicketsPerOrder, reservedUnits)` and one holder entry
(name as on the KTP + NIK) per ticket, with a "Saya sendiri" option prefilled from the profile name. Sources: ADR-0007
(1–3 tickets, NIK and name per ticket; the account holds no NIK), ADR-0004, `analysis/hifi-api-review.md` H-2 (add
"Nama sesuai KTP") and §4 "Ticket limit", `openapi.yaml` `getCategories`, `getMe`, `User`; ADR-0014 (ID/EN). Rules
come from spec 47; `reservedUnits` from spec 46. Holder submission, NIK checks and the hold are out of scope.

## Glossary

| Term          | Definition                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| Category row  | `OrderCategoryView` (specs 44) plus `quantity`, `selected`, `canIncrement`, `canDecrement` and the two button labels |
| Order limit   | `orderTicketSelectionUseCase.orderLimit({ maxTicketsPerOrder, reservedUnits })`                                      |
| Holder view   | One block per ticket slot: title "Tiket n · <category>", holder type, name field, NIK field                          |
| Holder choice | The "Saya sendiri" / "Orang lain" radio pair; shown only when the profile has a name                                 |
| Profile name  | `getMe` → `User.fullName`, trimmed; '' when missing, while loading, or when `/me` fails                              |
| Masked NIK    | Digits grouped by 4, all but the first 4 and last 4 replaced by "•": `3174 •••• •••• 0004`                           |

## Requirements

### Requirement 1: Steppers per category

**User Story:**

AS a buyer whose turn came
I WANT to add and remove tickets per category, up to my limit
SO THAT I can pick 1–3 tickets across categories within the 5 minutes

#### Acceptance Criteria

- SHALL expose on every category row `quantity`, `selected` (`quantity > 0`), `canIncrement`, `canDecrement`,
  `incrementLabel` ("Tambah <Category>" / "Add <Category>") and `decrementLabel` ("Kurangi <Category>" /
  "Remove <Category>"), keeping every existing `OrderCategoryView` field
- SHALL expose `increment(categoryId)`, `decrement(categoryId)`, `totalTickets` and `orderLimit`
- SHALL compute the limit and the allowed changes only through `orderTicketSelectionUseCase` (no rule in the body)
- WHEN `increment` / `decrement` returns `unchanged` THEN SHALL change nothing and show nothing
- SHALL start with every quantity at 0
- WHEN the language changes THEN SHALL keep the quantities and retranslate the button labels
- SHALL NOT disable sold-out categories or show the limit line (FR-14-W1)

### Requirement 2: One holder block per ticket

**User Story:**

AS a buyer
I WANT one holder block per ticket, labelled with its number and category
SO THAT I fill in the right person for each ticket

#### Acceptance Criteria

- SHALL expose `showHolders` (`totalTickets >= 1` and status `ready`) and `holders`, one view per slot from
  `summarize(...).slots`, in slot order
- SHALL title each view `t('order_holder_title', { index, category })` → "Tiket 1 · Festival B" / "Ticket 1 · Festival B"
- SHALL give each view a stable `key` (the slot key) and input ids derived from it
- WHEN quantities change THEN SHALL set the form's holders to `reconcileHolders(current, nextSlots)`, so typed values
  stay with their ticket and new tickets start as `other` with empty fields
- SHALL NOT submit, validate against the API or hold anything (FR-15-W1, hold out of scope)

### Requirement 3: "Saya sendiri" prefill from the profile

**User Story:**

AS a buyer who goes to the concert myself
I WANT "Saya sendiri" to fill in my name from my profile
SO THAT I only type my NIK

#### Acceptance Criteria

- SHALL fetch the profile with `useQueryTanstack` (`[QUERY_KEYS.ME]`, `accountService.getMe`), `enabled` only when the
  order status is `ready`, `retry: false`, `refetchOnWindowFocus: false`
- SHALL expose `showHolderChoice` = the profile name is not empty
- WHEN a holder chooses `self` THEN SHALL apply `setHolderType(…, 'self', profileName)`: name = profile name, read-only,
  hint "Dari profil Anda." / "From your profile."; the NIK stays empty and editable
- WHEN a holder goes from `self` to `other` THEN the name SHALL be cleared and editable again with the hint
  "Dicetak di e-tiket." / "Printed on the e-ticket."
- WHILE another ticket is `self` THEN that holder's `selfDisabled` SHALL be true (block, spec 47)
- WHEN `/me` fails (any code, including 401 and `NETWORK_ERROR`), is still loading, or returns no `fullName` THEN SHALL
  hide the choice (plain editable fields), show no error, open no popup and not redirect
- SHALL NOT block the steppers or the holder fields on `/me`
- SHALL NOT read, show or prefill a NIK from the account (ADR-0007: "The account no longer needs a NIK")

### Requirement 4: Holder form with React Hook Form and Zod

**User Story:**

AS a developer
I WANT the holder values in one React Hook Form with a Zod schema
SO THAT FR-15-W1 and the hold can add validation and submission without restructuring

#### Acceptance Criteria

- SHALL keep the holders in `useForm` with `zodResolver(holdersSchema)` and read them with `useWatch` (never `watch()`)
- SHALL define the schema as `{ holders: { slotKey, holderType: 'self' | 'other', fullName, nik }[] }`, with `fullName`
  trimmed, non-empty (`login_name_required`) and at most 200 characters (`login_name_too_long`) for a later submit
- SHALL keep only digits in the NIK value on every change (paste "3174 0552 0396 0004" → `3174055203960004`)
- SHALL NOT add NIK length, structure, duplicate or Dukcapil rules (FR-15-W1)
- SHALL NOT show any field error in this ticket (no submit is wired)

### Requirement 5: NIK privacy and masking

**User Story:**

AS a ticket holder
I WANT my NIK hidden on screen once typed and never sent anywhere it should not go
SO THAT my identity number is not exposed (UU PDP, ADR-0007)

#### Acceptance Criteria

- SHALL expose the NIK field `value` as the raw digits while that field has focus and as `maskNik(digits)` otherwise
  (`3174 •••• •••• 0004`)
- SHALL keep the masking and digit filtering in `src/utils/format/nik.ts` (`toNikDigits`, `maskNik`), pure and tested
- SHALL NOT pass a NIK or holder name to `analyticsAdapter`, `reportError`, `console`, storage or a query key
- SHALL NOT add analytics events for stepper or holder changes (see design)

### Requirement 6: Copy in Indonesian and English

**User Story:**

AS a buyer reading Indonesian or English
I WANT every new label in my language
SO THAT the page reads naturally (ADR-0014)

#### Acceptance Criteria

- SHALL add every new key to `src/translation/locale/id.json` and `en.json` with the copy in the design's key table
- SHALL use the Figma copy for ID and the HiFi EN where the HiFi has one ("16 digits, as on the KTP",
  "Example: 3201 1234 5678 0001")

### Requirement 7: Integration and tests

**User Story:**

AS a developer
I WANT the controller extended without breaking the existing page
SO THAT FR-11/12 behaviour stays as it is

#### Acceptance Criteria

- SHALL keep every existing `OrderControllerInterface` field and its behaviour
- SHALL add `accountService` and `orderTicketSelectionUseCase` to the controller's `Pick<AwilixRegistry, …>`; both are
  registered (`services.registry.ts`), and `orderController` stays registered in
  `src/infrastructure/di/controllers/order.ts` as `asFunction(OrderController)`
- SHALL update `src/controllers/__tests__/order.controller.test.ts` and the typed `OrderCategoryView` fixtures in the
  Order presentation tests so `tsc --noEmit` passes
- SHALL keep controller and utils coverage ≥ 85%
- No use-case spec beyond spec 47 is needed: `getMe` is a simple GET with no transformation (rule table "No — controller
  wraps the service in `useQuery`")
