# Implementation Plan: Order ticket selection (use case)

## Overview

Write `OrderTicketSelectionUseCase`: the order limit, stepper changes, ticket slots, holder reconciliation keyed by slot
and the one-"Saya sendiri" rule (block, not move), all pure and synchronous; register it in DI; test every branch.
Writer: use-case-writer. Depends on spec 46 (`reservedUnits`). Spec 48 calls it.

## Tasks

- [ ] 1. Create `src/core/use_case/booking/order-ticket-selection.use-case.ts` with the types, `ORDER_MAX_TICKETS`, `orderLimit`, `summarize`, `increment` and `decrement` [Requirement 1, Requirement 2, Requirement 3]
- [ ] 2. Add `reconcileHolders`, `canChooseSelf` and `setHolderType` (block on `SELF_TAKEN`, profile name trimmed, `nik` untouched) to the same file [Requirement 4, Requirement 5]
- [ ] 3. Write `src/core/use_case/booking/__tests__/order-ticket-selection.use-case.test.ts` covering every case in the Testing Strategy [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5, Requirement 6]
- [ ] 4. Register `orderTicketSelectionUseCase: asFunction(OrderTicketSelectionUseCase).singleton()` in `services.registry.ts`, add it to `AwilixRegistry` and to `KEYS` in `src/infrastructure/di/__tests__/registry.test.ts` [Requirement 6]
- [ ] 5. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 4], [3], [5]] }
```

## Notes

- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage ≥ 85% on the new file; the registry test
  confirms every `AwilixRegistry` key is registered.
- Block vs move is decided (block, from the Figma disabled "Saya sendiri" on Tiket 2/3). If the owner prefers move,
  only `setHolderType` and its tests change; the controller and page keep the same interface.
- `ORDER_MAX_TICKETS = 3` mirrors `createBooking.tickets.maxItems`; it is a contract constant, not config.
- Deferred: sold-out stepper disabling, the "3/3 Batas 3 tiket tercapai…" limit line and stock-aware limits (FR-14-W1,
  #14); NIK format, duplicate-NIK error, `validateAttendee` / Dukcapil states (FR-15-W1, #15); summary aside, phone dock,
  "Lanjut ke pembayaran" / `createBooking` hold, section 3 "Kirim e-tiket ke"; timer and time's-up sheet
  (FR-17/18-W1); Figma's profile-NIK card, "Profil Anda belum punya NIK." and "Simpan NIK ini ke profil" (conflict with
  ADR-0007); queue `Admission.maxTickets` → `reservedUnits` (follow-up).
- Commit: `feat(order): [FR-13-W1] add ticket selection and holder rules`.
