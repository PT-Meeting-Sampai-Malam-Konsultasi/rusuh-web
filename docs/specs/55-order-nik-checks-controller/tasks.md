# Implementation Plan: Order NIK checks (controller)

## Overview

Extend `OrderController` with per-slot NIK check state: local errors from `validateAttendeeUseCase.checkNik` (duplicate at
once; 16 digits / structure after blur), a Dukcapil check through one `useMutationTanstack` on NIK blur, name blur and
"Saya sendiri", results tied to the exact values checked (changes, removal and stale responses reset them), translated
messages with "Periksa lagi" for retryable failures, the admission redirect, `allHoldersVerified` and the
`order_nik_checked` event. Writer: controller-writer. Depends on spec 54 (and 53); spec 56 renders it and writes the
translation keys.

## Tasks

- [ ] 1. In `src/controllers/order.controller.ts`: add `validateAttendeeUseCase` and `useMutationTanstack` to `OrderControllerDeps`; add `name.onBlur`, `nik.error/valid/checking/canRecheck/recheck` and `allHoldersVerified` to the interfaces; update the `nik` schema comment [Requirement 1, Requirement 7]
- [ ] 2. In the same file: `checks` and `touchedNik` state, the `nikCheck` mutation (`retry: false`, `onMutate`, `onSuccess` with redirect, analytics and stale guard, `onError` with stale guard), `startCheck` / `dropRun`, triggers on NIK blur, name blur, "self" choice and `recheck`, resets on value/type change and in `applyQuantities` [Requirement 2, Requirement 3, Requirement 5, Requirement 6]
- [ ] 3. In the same file: derive each holder's field state in the `holders` `useMemo` per the field-state table (local check first, then the matching run), translate the messages, compute `allHoldersVerified` [Requirement 1, Requirement 4, Requirement 6]
- [ ] 4. Update `src/presentation/pages/Order/__tests__/index.test.tsx` (`allHoldersVerified`) and the holder fixture in `HolderList/__tests__/index.test.tsx` (new required fields) so `tsc --noEmit` passes [Requirement 7]
- [ ] 5. Add `describe('NIK checks')` to `src/controllers/__tests__/order.controller.test.ts` per the Testing Strategy (13 field-state rows, triggers, token at call time, concurrent slots, stale responses, resets, removal, recheck, redirect, analytics, privacy, language rerender) [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5, Requirement 6, Requirement 7]
- [ ] 6. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2], [3, 4], [5], [6]] }
```

## Notes

- Gate: `npx tsc --noEmit && npm run lint && npx vitest --run`; controller coverage ≥ 85%. Tasks 1–3 edit the same file,
  in sequence.
- Re-check before done: no runtime import from `@core`; no `useLoading` / `usePopupError`; no NIK, name, token or error
  object passed to analytics or `reportError`; the token is read in `mutationFn` only.
- Deviations (design Overview): no loading overlay for a field check; `retry: false` (the retry is in spec 54); no
  "Format NIK valid" tick (HiFi) — the tick waits for Dukcapil.
- Translation keys are listed in the design and written by spec 56 task 1 (same PR).
- Accepted: a kept `valid` result survives a change of the slot's `fieldIndex` (a ticket added in an earlier category);
  the hold (FR-16+) re-checks the tokens.
- Commit: `feat(order): [FR-15-W1] check each holder nik against dukcapil`.
