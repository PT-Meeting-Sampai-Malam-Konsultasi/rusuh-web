# Implementation Plan: Order hold (page)

## Overview

Render spec 73's `summary` and `checkout` on the Order page as in the HiFi: `OrderSummary` (the "Ringkasan" aside in the
flow grid's right column from 720px: lines, "Biaya layanan" once per order, Total, "Lanjut ke pembayaran →", the hint,
the 10-minute note) and `OrderDock` (the fixed phone bar: count, total, "Lanjut bayar →", hint, with a spacer). Add the
ID / EN copy for every new key. Writer: presentation-writer. Depends on spec 73. Until FR-20-W1 (rusuh-web#19) merges, a
successful hold lands on the not-found page.

## Tasks

- [x] 1. Add the 14 keys of the design's copy table (ID and EN, `order_summary_tickets` as `_one` / `_other`) to `src/translation/locale/id.json` and `en.json` after `order_nik_recheck`, and assert them in `src/infrastructure/i18n/__tests__/i18n.test.ts` [Requirement 5]
- [x] 2. Create `src/presentation/pages/Order/components/OrderSummary/index.tsx` and `order-summary.module.css` per the design (aside labelled by its `h2`, lines list, fee and total rows, shared `Button` `fullWidth` / `disabled` / `busy` with the `aria-hidden` arrow and `aria-describedby`, hint with `role="alert"` when it is an error, note; hidden below 720px, sticky card from 720px) [Requirement 1, Requirement 4]
- [x] 3. Create `src/presentation/pages/Order/components/OrderDock/index.tsx` and `order-dock.module.css` per the design (phone-only spacer of 130px, fixed bottom `section` named by `dockLabel`, hint, count over total, `Button` with the short label; hidden from 720px) [Requirement 2, Requirement 4]
- [x] 4. In `src/presentation/pages/Order/index.tsx`: read `summary` and `checkout`, render `OrderSummary` as the second child of `main` (replacing the deferred-aside comment) and `OrderDock` after `</main>` when both are non-null; update the column comment in `order.module.css` [Requirement 3]
- [x] 5. Tests: `OrderSummary/__tests__/index.test.tsx` and `OrderDock/__tests__/index.test.tsx` (landmarks and names, lines and amounts, disabled / busy / enabled click, hint roles and description, CSS module checks) and the shell cases in `src/presentation/pages/Order/__tests__/index.test.tsx` (both sections only with `summary` and `checkout`, placement, sheet still last) [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 6]
- [x] 6. Run the gate check, the build and the manual check at 390 and 1440, ID and EN, with the mock scenarios in the design's Testing Strategy [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3], [4], [5], [6]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run && npm run build && npm run check:bundle`; `npm run lint` (ESLint +
  Stylelint) runs in lint-staged; `out/order.html` keeps scoped class names.
- Specs 71–73 land first in the same PR (`OrderSummaryView` / `OrderCheckoutView`, and `base()` already has `summary:
null`, `checkout: null`).
- Spacer: a fixed 130px (the HiFi's phone `padding-bottom`); it already covers the dock plus a one-line hint, so it does
  not change with the hint.
- Sections take no `t`: all texts arrive translated in the views.
- HiFi differences (fee once per order, `button` instead of a link, hidden at 0 tickets, the hint line, no e-mail block)
  are listed in the design.
- Commit: `feat(order): [FR-16-W1] add the order summary and the continue button`.
