# Requirements Document

## Introduction

Page logic for FR-14-W1 (rusuh-web#14, "Web: Order: stepper limits (stock, max 3, reserved units)"; parent FR-14
"Sistem menolak/menonaktifkan pemilihan jumlah yang melebihi stok available, melebihi batas 3, atau yang menyebabkan
akumulasi tiket NIK/sesi tersebut melebihi 3 (termasuk booking lain yang masih aktif)."). `orderController` gains stock-
aware rows (sold-out and snapshot caps from spec 50), a limit notice for the HiFi line "3/3 Batas 3 tiket tercapai.
Kurangi satu untuk ganti kategori." (with a reservation variant when the limit is 1 or 2, ADR-0004), and a category note
that states the buyer's real limit. Sources: `architecture/customer-journey.md` F13/F14 ("Disable + / show limit"),
`analysis/hifi-api-review.md` §4 "Ticket limit", HiFi `analysis/hifi/detail.html` (line 33 and its script), ADR-0004,
ADR-0007, ADR-0014 (ID/EN), `openapi.yaml` `getCategories`. Rules come from spec 50.

No new use-case spec beyond spec 50: the rules are in `orderTicketSelectionUseCase`; this layer only translates them.
No new API call.

Out of scope: per-NIK seats across bookings and one active booking per account (server-enforced: `NIK_SEAT_TAKEN`,
FR-15-W1, ADR-0007; `ACCOUNT_HAS_ACTIVE_BOOKING`); the hold and its codes `QUANTITY_OVER_RESERVATION` /
`CATEGORY_SOLD_OUT`; live stock refresh (snapshot at load, Q-20).

## Glossary

| Term          | Definition                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| Order limit   | `orderTicketSelectionUseCase.orderLimit(ok)` = `min(3, maxTicketsPerOrder, reservedUnits)`; 0 until loaded    |
| Category cap  | Spec 50: 0 when sold out, `available` when it is a whole number ≥ 0, otherwise none                           |
| Limit notice  | `{ count, message }` shown under the category list when the order limit is reached; `null` otherwise          |
| Notice count  | `${totalTickets}/${orderLimit}`, e.g. "3/3" or "2/2"                                                          |
| Reserved copy | The variant used when the limit is below 3 (`limitBelowMax`): "Kuota giliran Anda 2 tiket. …" (proposed copy) |

## Requirements

### Requirement 1: Rows follow the stock caps

**User Story:**

AS a buyer whose turn came
I WANT "+" off on sold-out categories and on categories with no units left in the snapshot
SO THAT I only pick tickets that can still be held

#### Acceptance Criteria

- SHALL pass the loaded `Category[]` (with `availability` and `available`) to the use case as the selectable categories
- SHALL take every row's `canIncrement` and `canDecrement` from `summarize(...).lines` only (no rule in the body)
- WHEN a category is sold out and its quantity is 0 THEN its row SHALL have `canIncrement: false` and
  `canDecrement: false`
- WHEN a picked category becomes sold out or drops below the picked quantity after a refetch (e.g. a language change)
  THEN its row SHALL keep the quantity with `canIncrement: false` and `canDecrement: true`
- WHEN `increment` returns `unchanged` (`SOLD_OUT`, `STOCK_REACHED`, `LIMIT_REACHED`, `UNKNOWN_CATEGORY`) THEN SHALL
  change nothing: no state update, no popup, no analytics event

### Requirement 2: Limit notice

**User Story:**

AS a buyer who reached my limit
I WANT a short line that says so and how to switch category
SO THAT a disabled "+" never looks broken

#### Acceptance Criteria

- SHALL expose `limitNotice: OrderLimitNotice | null`
- WHEN `status === 'ready'` and `selection.limitReached` THEN `limitNotice` SHALL be
  `{ count: '<total>/<limit>', message }`; otherwise SHALL be `null`
- WHEN the limit is not below 3 (`limitBelowMax` false) THEN `message` SHALL be `t('order_limit_reached', { count: limit })`
  → ID "Batas 3 tiket tercapai. Kurangi satu untuk ganti kategori." / EN "You've hit the 3-ticket limit. Remove one to
  switch category."
- WHEN the limit is below 3 (`limitBelowMax` true, reservation of 1 or 2, ADR-0004) THEN `message` SHALL be
  `t('order_limit_reached_reserved', { count: limit })` → ID "Kuota giliran Anda 2 tiket. Kurangi satu untuk ganti
  kategori." / EN "Your turn holds 2 tickets. Remove one to switch category." (EN "1 ticket" for 1)
- WHEN a ticket is removed below the limit THEN `limitNotice` SHALL become `null`
- WHEN the language changes THEN SHALL keep the quantities and retranslate the message
- SHALL NOT show a notice for a stock cap (the row's "Hampir habis" / "Habis" label carries it) or when the limit is 0
- SHALL NOT open a popup or track an analytics event for a reached limit

### Requirement 3: Category note states the real limit

**User Story:**

AS a buyer whose reservation is smaller than 3
I WANT the note under "Kategori" to state my limit
SO THAT it does not promise 3 tickets when my turn holds 2

#### Acceptance Criteria

- SHALL compute `categoryNote` as `t('order_category_note', { count: orderLimit })` when the categories are loaded, and
  `''` before (replacing spec 48's `count: ok.maxTicketsPerOrder`)
- WHEN `maxTicketsPerOrder` is 3 and `reservedUnits` is 2 THEN the note SHALL read "Maks. 2 tiket per transaksi. Tanpa
  nomor kursi — masuk sesuai kategori." / "Max 2 tickets per order. …"
- WHEN `reservedUnits` is 1 THEN the EN note SHALL use the singular form ("Max 1 ticket per order. …")
- WHEN the limit is 3 THEN the note SHALL stay exactly as today

### Requirement 4: Copy in Indonesian and English

**User Story:**

AS a buyer reading Indonesian or English
I WANT the limit line in my language
SO THAT it reads naturally (ADR-0014)

#### Acceptance Criteria

- SHALL add `order_limit_reached_one`, `order_limit_reached_other`, `order_limit_reached_reserved_one` and
  `order_limit_reached_reserved_other` to `src/translation/locale/id.json` and `en.json` with the copy in the design's
  key table (both suffixes in both files, like `order_category_note_one/_other`, for key parity)
- SHALL use the HiFi copy for `order_limit_reached` and mark the `order_limit_reached_reserved` copy as proposed (no
  HiFi or Figma frame)

### Requirement 5: Integration and tests

**User Story:**

AS a developer
I WANT the controller extended without breaking FR-11/12/13 behaviour
SO THAT the page keeps working while the limits arrive

#### Acceptance Criteria

- SHALL keep every existing `OrderControllerInterface` field and its behaviour except `categoryNote`'s count
  (Requirement 3)
- SHALL add no DI dependency; `orderController` stays `asFunction(OrderController)` in
  `src/infrastructure/di/controllers/order.ts`
- SHALL update `src/controllers/__tests__/order.controller.test.ts` (including the assertion that the note stays at 3
  with `reservedUnits: 2`, which now expects 2) and add `limitNotice` to the shell's fake controller in
  `src/presentation/pages/Order/__tests__/index.test.tsx` so `tsc --noEmit` passes
- SHALL keep controller coverage ≥ 85%
