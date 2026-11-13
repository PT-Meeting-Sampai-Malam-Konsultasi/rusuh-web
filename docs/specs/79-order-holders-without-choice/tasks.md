# Implementation Plan: Order holders without the "Saya sendiri" choice

## Overview

Remove the holder choice from the use case, the controller, the holder list and the translations; update the tests that
covered it. Supersedes the choice parts of specs 47, 48, 49 and 55 (each carries a note at the top).

## Tasks

- [x] 1. Drop `holderType`, `HolderType`, `SetHolderTypeResult`, `canChooseSelf` and `setHolderType` from
      `order-ticket-selection.use-case.ts` and its tests [Requirement 1]
- [x] 2. Drop `meQuery`, `accountService`, `showHolderChoice`, the view's choice fields, `readOnly` and `myself_used`
      from `order.controller.ts`; replace the profile tests [Requirement 2]
- [x] 3. Remove the radiogroup, `showChoice` and the choice CSS from `HolderList`, the prop from the order shell, and
      the four translation keys; update their tests [Requirement 3]
- [x] 4. Run the gate check (`tsc`, lint, `vitest --coverage`) and look at `/order` with mock data [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2], [3], [4]] }
```

## Notes

- Gate on 13 Nov 2026: typecheck and lint clean, 1,513 tests pass, 98.8% line coverage.
- Specs 46, 50, 51, 52, 56, 59 and 62 mention `getMe`, `canChooseSelf` or `setHolderType` only as "unchanged"; read
  those mentions as removed.
