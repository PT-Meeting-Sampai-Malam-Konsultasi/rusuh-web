# Implementation Plan: Order steppers and holders (controller)

## Overview

Extend `OrderController` with per-category steppers (quantities in `useState`, rules from `orderTicketSelectionUseCase`),
a React Hook Form + Zod holder form with one entry per ticket slot, a `getMe` query for the "Saya sendiri" prefill that
fails silently, and masked NIK display from a new pure formatter. Add the ID/EN keys. Writer: controller-writer.
Depends on spec 46 (`reservedUnits`) and spec 47 (`orderTicketSelectionUseCase`). Spec 49 renders it. No separate
use-case spec for `getMe` (simple GET, see design Overview).

## Tasks

- [x] 1. Create `src/utils/format/nik.ts` (`toNikDigits`, `maskNik`) and `src/utils/format/__tests__/nik.test.ts` [Requirement 5]
- [x] 2. Add the 15 keys from the design table to `src/translation/locale/id.json` and `en.json` [Requirement 6]
- [x] 3. In `src/controllers/order.controller.ts`: add `orderTicketSelectionUseCase` and `accountService` to the deps; quantities state, `orderLimit`, `summarize`, `OrderCategoryRow` rows with labels, `increment`, `decrement`, `totalTickets` [Requirement 1, Requirement 7]
- [x] 4. In the same file: `meQuery` (enabled when ready, `retry: false`, `refetchOnWindowFocus: false`), `showHolderChoice`, holder form (`useForm` + `zodResolver(holdersSchema)`, `useWatch`), reconcile on quantity change, `OrderHolderView`s with `choose`, name and NIK fields, focus-based masking; export `OrderHolderType` and the view types [Requirement 2, Requirement 3, Requirement 4, Requirement 5]
- [x] 5. Update `src/controllers/__tests__/order.controller.test.ts` per the Testing Strategy (query routing for `me`, rows, limit, holders following slots, self/other, hidden choice, NIK digits and masking, no NIK or name in analytics) [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5, Requirement 7]
- [x] 6. Add the new row and interface fields to the typed fixtures in `src/presentation/pages/Order/__tests__/index.test.tsx` and `CategoryList/__tests__/index.test.tsx` so `tsc` passes [Requirement 7]
- [x] 7. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2], [3], [4], [5, 6], [7]] }
```

## Notes

- Gate: `npx tsc --noEmit && npm run lint && npx vitest --run && npm run build`; controller and utils coverage ≥ 85%;
  the i18n parity test checks the new keys; `npm run check:bundle` stays within budget (RHF and Zod already ship with
  the login and account pages; here they load only with the Order page).
- Re-check before done: no `console`, no NIK or name in `trackEvent` / `reportError`, no `watch()`, no `useEffect` with
  a service call, every destructured DI key registered.
- "Saya sendiri" is block, not move (spec 47). The disabled option has no explanatory copy in Figma; see the open
  question in spec 49.
- Deferred: sold-out stepper disabling, the "3/3 Batas 3 tiket tercapai…" limit line and stock-aware limits (FR-14-W1,
  #14); NIK format checks, duplicate-NIK error, `validateAttendee` / Dukcapil states and any 16-digit cap (FR-15-W1,
  #15); summary aside "Ringkasan", phone dock, "Lanjut ke pembayaran" / `createBooking` hold, section 3
  "Kirim e-tiket ke"; timer and time's-up sheet (FR-17/18-W1); Figma's profile-NIK card, "Profil Anda belum punya NIK."
  and "Simpan NIK ini ke profil" (conflict with ADR-0007); queue `Admission.maxTickets` → `reservedUnits` (follow-up).
- Commit: `feat(order): [FR-13-W1] add ticket steppers and holder form logic`.
