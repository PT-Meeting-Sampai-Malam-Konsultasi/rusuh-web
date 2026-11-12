# Implementation Plan: Order NIK checks (page)

## Overview

Render the NIK check states from spec 55 in `HolderList`: error and valid lines through the existing `TextField`, the
"Memeriksa ke Dukcapil…" hint plus a polite status region and `aria-busy` while checking (input stays editable), a quiet
"Periksa lagi" button for retryable failures, and the name field's blur. Add the 11 ID/EN keys and fix the NIK hint
example so it passes the structure rule. Writer: presentation-writer. Depends on spec 55 (and 54 for the hint check in
the i18n test).

## Tasks

- [x] 1. Add the 11 keys from the design table to `src/translation/locale/id.json` and `en.json` and change `order_holder_nik_hint` to "Contoh: 3201 1252 0396 0001" / "Example: 3201 1252 0396 0001" [Requirement 5]
- [x] 2. `HolderList/index.tsx`: forward `name.onBlur`; wrap the NIK `TextField` in `.nikCell` with `error`, `valid`, the checking/example hint and `aria-busy`; add the per-holder `role="status"` region and the `canRecheck` button described by the message line [Requirement 1, Requirement 2, Requirement 3, Requirement 4]
- [x] 3. `HolderList/holder-list.module.css`: add `.nikCell`, `.recheck` (hover, focus-visible, active, disabled, reduced motion) and `.srOnly`, tokens only [Requirement 3]
- [x] 4. Tests: `HolderList/__tests__/index.test.tsx` for every state, same status node across rerenders, recheck, blurs, ID and EN strings; `src/infrastructure/i18n/__tests__/i18n.test.ts` for the EN plural and both hint examples passing `checkNik` [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5, Requirement 6]
- [x] 5. Run the gate check and the manual check with the spec 53 sample NIKs at 390 and 1440, ID and EN [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3], [4], [5]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run && npm run build`; `npm run lint` runs in lint-staged; `out/order.html`
  keeps scoped class names.
- `TextField` is reused unchanged (it already has `error` / `valid` / `hint` and spreads `aria-busy`).
- Copy: `order_nik_duplicate` is HiFi; `order_nik_incomplete`, `order_nik_invalid_structure`, `order_nik_use_another`
  are proposed; confirm with the designer. HiFi "✓ Format NIK valid" is replaced by the Dukcapil tick (ADR-0007).
- `allHoldersVerified` is not rendered: the payment button is FR-16+.
- Out of scope: the hold, the order countdown (FR-17-W1), a client-side attempt counter, a "name required" message.
- Commit: `feat(order): [FR-15-W1] show nik check states under each holder`.
