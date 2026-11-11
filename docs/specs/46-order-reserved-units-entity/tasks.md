# Implementation Plan: Order reserved units (entity + service)

## Overview

Rename `maxTickets` to `reservedUnits` for `getCategories` only: the booking entity, the categories use-case result,
the MSW handler and every fixture and test that types them. No service, registry or controller source change
(`bookingService.getCategories` and `accountService.getMe` already exist). Writer: service-writer (entity) with the
use-case and mock edits in the same commit so `tsc` stays green. Depends on specs 12–14. Spec 47 reads the field.

## Tasks

- [x] 1. In `src/core/entities/booking/booking.entity.ts` rename `GetCategoriesResponse.maxTickets` to `reservedUnits: number` with the contract description and the ADR-0004 reference [Requirement 1]
- [x] 2. In `src/core/use_case/booking/get-order-categories.use-case.ts` rename the `ok` field to `reservedUnits` (copied from `data.reservedUnits`); update `__tests__/get-order-categories.use-case.test.ts` fixture and expectations, add the no-`maxTickets` assertion [Requirement 2]
- [x] 3. In `src/infrastructure/mocks/handlers/booking.handlers.ts` return `reservedUnits: 3`; update `src/infrastructure/mocks/__tests__/booking.handlers.test.ts` [Requirement 3]
- [x] 4. Update the `okResult` fixture in `src/controllers/__tests__/order.controller.test.ts` to `reservedUnits: 3`; confirm no queue file changed [Requirement 3]
- [x] 5. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 3, 4], [5]] }
```

## Notes

- Gate: `npm run typecheck && npm run lint && npx vitest --run`; use-case coverage stays ≥ 85%;
  `grep -rn "maxTickets\b" src` matches only the queue `Admission` entity, `queue.handlers.ts` and their tests.
- Follow-up (not this spec): queue `Admission.maxTickets` → `reservedUnits` (`openapi.yaml` `Admission`, line 1556).
  Needs its own sub-issue; ask the user for the code.
- Deferred to other tickets, listed here so nobody adds them: sold-out stepper disabling, the "3/3 Batas 3 tiket
  tercapai…" limit line and stock-aware limits (FR-14-W1, #14); NIK format, duplicate-NIK, `validateAttendee` /
  Dukcapil states (FR-15-W1, #15); summary aside, phone dock, "Lanjut ke pembayaran" / `createBooking`, section 3
  "Kirim e-tiket ke"; timer and time's-up sheet (FR-17/18-W1); Figma's profile-NIK card and "Simpan NIK ini ke profil"
  (conflict with ADR-0007).
- Commit: `feat(order): [FR-13-W1] read reserved units from the categories response`.
