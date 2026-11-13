# Design Document

## Overview

A removal across three layers, no new behaviour. The holder block keeps its title, name and NIK fields and every NIK
state from spec 55; the radio pair, the read-only profile name and the profile query go. The account holds no NIK (D17,
ADR-0007), so "Saya sendiri" saved the buyer only their name, at the cost of an extra `/me` call, a one-ticket-only rule
and two extra states per block.

## Architecture

```
src/core/use_case/booking/order-ticket-selection.use-case.ts   HolderEntry { slotKey, fullName, nik }; no self rules
src/controllers/order.controller.ts                            no meQuery / accountService / showHolderChoice
src/presentation/pages/Order/index.tsx                         <HolderList t holders />
src/presentation/pages/Order/components/HolderList/            title + fields only; choice CSS removed
src/translation/locale/{id,en}.json                            4 keys removed
```

API operations: `getMe` is no longer called from `/order`. Everything else (`getEvent`, `getCategories`,
`validateAttendee`, `createBooking`, `enterPayment`) is unchanged.

## Components and Interfaces

```ts
export interface HolderEntry {
  slotKey: string;
  fullName: string;
  /** Digits only; never logged. */
  nik: string;
}

export interface OrderHolderNameField {
  id: string;
  value: string;
  /** "Dicetak di e-tiket.". */
  hint: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}

export interface OrderHolderView {
  key: string;
  title: string;
  name: OrderHolderNameField;
  nik: OrderHolderNikField; // unchanged (spec 55)
}

interface HolderListProps {
  t: TFunction;
  holders: OrderHolderView[];
}
```

`OrderControllerInterface` loses `showHolderChoice`; the rest is unchanged.

## Data Models

Form values: `{ holders: { slotKey, fullName, nik }[] }`. Analytics `holders_complete`: `{ event_id, ticket_count }`.

## Layer Constraints

- Use case: "Return typed discriminated unions; never throw for an expected business outcome" — the remaining methods
  keep their results.
- Controller: "Return only what the screen needs, already translated or formatted."
- Presentation: sections stay props-in / JSX-out.

## Correctness Properties

- Property 1: no `OrderHolderView` has a holder type, and every name field is editable with the hint
  `order_holder_name_hint`. **Validates: Requirements 2, 3**
- Property 2: rendering the order page issues no query keyed `me`. **Validates: Requirements 2**
- Property 3: `HolderList` renders no `radiogroup` or `radio` for any number of holders. **Validates: Requirements 3**
- Property 4: `reconcileHolders` returns `{ slotKey, fullName: '', nik: '' }` for new slots and keeps typed entries with
  their slot (spec 47 Property 6 without the self clause). **Validates: Requirements 1**

## Error Handling

`getMe` failures no longer apply to `/order`. Every other row in specs 48, 51, 55, 59 and 62 is unchanged.

## Testing Strategy

- Use case: `reconcileHolders` cases without `holderType`; the `canChooseSelf` / `setHolderType` suites removed.
- Controller: the "profile" suite replaced by one test (no `me` query, name editable with the plain hint, no `choose`);
  the "Saya sendiri" NIK-check trigger test removed; `holders_complete` without `myself_used`.
- `HolderList`: no radios, every name editable with the plain hint, ID / EN strings without the choice labels.
- Order shell: holders section without radios.
