# Requirements Document

## Introduction

Page logic for FR-12-W1 (rusuh-web#12, parent FR-12 "Setiap kategori menampilkan jumlah tiket available dan harga yang
berbeda-beda."): the order controller's category views gain a formatted price and a translated availability label
("Tersedia" / "Hampir habis" / "Habis"), plus a `soldOut` flag for the row style. Aanwijzing T-08 and Q-20 / G-11
(decided 21 Oct): remaining stock is nice to have, not mandatory, and a snapshot at load is enough; the HiFi shows a
label, never a count (`analysis/hifi-api-review.md`: "`available` (count) is now optional: the HiFi never shows a
count"). No entity, service or use-case work: `Category.price` and `Category.availability` already exist
(`openapi.yaml` `Category`, spec 12) and the categories query is unchanged (spec 14). Sources:
`../rusuh-documentation/api/openapi.yaml` (`getCategories`, `Category`), `analysis/hifi/src/detail.html` lines 22–26,
ADR-0014.

## Glossary

| Term               | Definition                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Availability       | `Category.availability`: `available`, `almost_gone` or `sold_out`; a server-side label, a snapshot at load (Q-20) |
| Availability label | The translated word for it: ID "Tersedia" / "Hampir habis" / "Habis", EN "Available" / "Almost gone" / "Sold out" |
| Unknown value      | An `availability` string outside the three-value enum (a future server value, a bad payload)                      |
| Price              | `Category.price.amount`, whole rupiah, formatted `Rp 850.000` (ID) / `Rp 850,000` (EN)                            |

## Requirements

### Requirement 1: Price per category

**User Story:**

AS a buyer whose turn came
I WANT each category to show its price in my language's number format
SO THAT I can compare categories before the 5 minutes run out

#### Acceptance Criteria

- SHALL expose `price` on every category view as `formatRupiah(category.price.amount, locale)`, e.g. ID
  `Rp 1.250.000`, EN `Rp 1,250,000`
- WHEN the language changes THEN SHALL reformat every price without waiting for the categories refetch (the memo
  depends on `locale`)
- SHALL NOT compute totals, fees or per-ticket sums (FR-13/14-W1, ADR-0010)

### Requirement 2: Availability label per category

**User Story:**

AS a buyer
I WANT to see whether a category is available, almost gone or sold out
SO THAT I do not waste my turn on a category I cannot buy

#### Acceptance Criteria

- SHALL expose `availability` (the enum value), `availabilityLabel` (translated) and `soldOut` on every category view
- WHEN `availability` is `available` THEN `availabilityLabel` SHALL be `t('order_availability_available')`
  ("Tersedia" / "Available")
- WHEN `availability` is `almost_gone` THEN `availabilityLabel` SHALL be `t('order_availability_almost_gone')`
  ("Hampir habis" / "Almost gone")
- WHEN `availability` is `sold_out` THEN `availabilityLabel` SHALL be `t('order_availability_sold_out')`
  ("Habis" / "Sold out") and `soldOut` SHALL be `true`; otherwise `soldOut` SHALL be `false`
- WHEN `availability` is an unknown value THEN `availability` SHALL be `null`, `availabilityLabel` SHALL be `''` and
  `soldOut` SHALL be `false` (no label shown, price still shown)
- WHEN the language changes THEN SHALL retranslate every label (the memo depends on `t` and `locale`)
- SHALL NOT expose or show the `available` count (HiFi shows none; T-08 / Q-20)
- SHALL NOT poll or refresh availability (`refetchInterval` stays absent): the label is a snapshot at load (Q-20)
- SHALL NOT show a raw server value as a label

### Requirement 3: Pure mapping, translations and tests

**User Story:**

AS a developer
I WANT the mapping in a pure, tested function
SO THAT the controller body has no helpers and the rules are checked without React

#### Acceptance Criteria

- SHALL do the mapping in `toOrderCategoryView(category, locale, t)` in `src/utils/format/order-event.ts`, keeping
  `id`, `name`, `description` as today
- SHALL keep the categories in server order
- SHALL add `order_availability_available`, `order_availability_almost_gone`, `order_availability_sold_out` to
  `src/translation/locale/id.json` and `en.json`
- SHALL keep `orderController` registered in `src/infrastructure/di/controllers/order.ts` unchanged and
  `AwilixRegistry` unchanged (the interface type widens through `OrderCategoryView`)
- SHALL keep the utils and controller coverage at 85% or more
