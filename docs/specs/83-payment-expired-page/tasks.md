# Implementation Plan: Payment expired (page)

## Overview

Render spec 82's `PaymentExpiredView` on `/payment`: a new `PaymentExpired` section (stamp, display title, count body,
"Saldo terpotong?" note, "Antre lagi →" and "Ke beranda", focus on the title at mount) in the main column, one line in
the shell, and the nine `payment_expired_*` keys in ID and EN with the H-4 refund wording. No route, DI or shared
component change. Writer: presentation-writer. Depends on spec 82 (same PR).

## Tasks

- [x] 1. Add the nine `payment_expired_*` keys (spec 82 Data Models) after `payment_inactive_refund` in `src/translation/locale/id.json` and `en.json`, and extend `src/infrastructure/i18n/__tests__/i18n.test.ts` (payment `copy` table in order, plural EN 1 / 3, no "otomatis" / "automatic" / `@`) [Requirement 5]
- [x] 2. Create `src/presentation/pages/Payment/components/PaymentExpired/index.tsx` and `payment-expired.module.css` per the design (section, `Stamp tone="sold"`, focused `h1`, note with optional bold lead, optional `Button`, home `Link`; HiFi values) [Requirement 1, Requirement 2, Requirement 4]
- [x] 3. In `src/presentation/pages/Payment/index.tsx`: read `expired` and render `{expired && <PaymentExpired expired={expired} />}` after the message in the main column; drop the FR-23-W1 remark from `PaymentMessage`'s doc comment [Requirement 3]
- [x] 4. Tests: `components/PaymentExpired/__tests__/index.test.tsx` (structure, focus, note lead null, button present / absent, CSS module, real ID / EN strings); `expiredView()` in `__tests__/fixtures.ts`; shell tests in `__tests__/index.test.tsx` for the expired state with and without the aside [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 6]
- [x] 5. Run the gate check and the manual check at 390 and 1440, ID and EN, with `?mock=short_payment` (zero and reload) and `?mock=payment_late` [ALL] (gate green; browser: zero → expired at 1440 ID and 390 EN, Antre lagi → /queue; reload and `payment_late` covered by tests only: the mock loses its session on reload)

## Task Dependency Graph

```json
{ "waves": [[1, 2], [3], [4], [5]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run && npm run build`; `npm run lint` in lint-staged; `out/payment.html` keeps
  scoped class names.
- The i18n test asserts the exact order of every `payment_*` key in both files and in its `copy` object: insert the new
  keys in the same place in all three.
- `Stamp`, `Button`, `FlowHeader`, `Timer`, `PaymentSummary`, `PaymentDock`, `src/app/payment/*` have no diff.
- Commit: `feat(payment): [FR-23-W1] add the payment expired screen`.
