# Requirements Document

## Introduction

Removes the "Saya sendiri / Orang lain" choice from the order page's holder blocks (FR-13-W1, rusuh-web#13). The account
holds no NIK (D17; ADR-0007 "The account no longer needs a NIK"), so "Saya sendiri" could only prefill the name and the
buyer still typed the NIK. The owner asked on 13 Nov 2026 to drop the choice: every ticket now has a plain "Nama sesuai
KTP" and "NIK", typed in. This spec supersedes the holder-choice parts of specs 47, 48, 49 and 55; the stepper, slot,
form, NIK-check and hold rules stay as they are.

## Glossary

| Term         | Definition                                                                            |
| ------------ | ------------------------------------------------------------------------------------- |
| Holder block | One ticket's "Tiket n · Kategori" title, "Nama sesuai KTP" and "NIK" fields           |
| Holder entry | The values typed for one slot: `slotKey`, `fullName`, `nik` (no holder type any more) |

## Requirements

### Requirement 1: No holder choice in the rules

**User Story:**

AS a developer I WANT the order rules to know nothing of "self" or "other" SO THAT no code path depends on a profile
name

#### Acceptance Criteria

- SHALL define `HolderEntry` as `{ slotKey, fullName, nik }` and start every new slot as
  `{ slotKey, fullName: '', nik: '' }`
- SHALL remove `HolderType`, `SetHolderTypeResult`, `canChooseSelf` and `setHolderType` from
  `OrderTicketSelectionUseCase`
- SHALL keep `orderLimit`, `summarize`, `increment`, `decrement` and `reconcileHolders` unchanged

### Requirement 2: Controller without the profile

**User Story:**

AS a buyer I WANT to type the name and NIK of every ticket holder SO THAT the order works the same whether or not my
profile has a name

#### Acceptance Criteria

- SHALL NOT call `accountService.getMe` or hold a `[QUERY_KEYS.ME]` query on the order page; `accountService` leaves the
  controller's dependencies
- SHALL remove `showHolderChoice` from `OrderControllerInterface` and `holderType`, `choiceName`, `selfDisabled` and
  `choose` from `OrderHolderView`; `OrderHolderType` is no longer exported
- SHALL remove `readOnly` from `OrderHolderNameField`: the name is always editable, with the hint
  `order_holder_name_hint` ("Dicetak di e-tiket." / "Printed on the e-ticket.")
- SHALL drop `holderType` from the holder form schema (`{ slotKey, fullName, nik }`)
- SHALL send `holders_complete` with `event_id` and `ticket_count` only (no `myself_used`)
- SHALL keep the NIK checks of spec 55 with their triggers minus "choosing Saya sendiri": NIK blur, name blur and
  `recheck()`

### Requirement 3: Holder blocks without the choice

**User Story:**

AS a buyer on a phone or a desktop I WANT each ticket to show its title, then the name and NIK fields SO THAT the form
is short and the same for every ticket

#### Acceptance Criteria

- `HolderList` SHALL take `t` and `holders` only (no `showChoice`) and render, per ticket, the `h3` title followed by
  the fields; no radiogroup, no radio
- SHALL remove the `.blockHead`, `.choice`, `.option` and `.radio` styles
- SHALL remove the keys `order_holder_for_label`, `order_holder_self`, `order_holder_other` and
  `order_holder_name_hint_profile` from `id.json` and `en.json`
- The order shell SHALL render `<HolderList t={t} holders={holders} />`
