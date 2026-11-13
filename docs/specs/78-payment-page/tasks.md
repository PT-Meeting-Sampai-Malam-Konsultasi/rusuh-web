# Implementation Plan: Payment page

## Overview

Add the `/payment?booking=` route (Suspense skeleton, segment `error.tsx` that says the held tickets are safe) and the
`Payment` screen rendering spec 77's views: `FlowHeader` with a done step 1 and no timer, the panel column
(`PaymentIntro`, `PaymentProgress`, `PaymentMessage`, `PaymentSkeleton`), the "Pesanan" aside with "Bayar"
(`PaymentSummary`, ≥ 720px) and the phone dock "Bayar Rp X" (`PaymentDock`, < 720px), plus the ID / EN copy. No method
picker (H-3), no countdown (FR-21-W1), no full expired screen (FR-23-W1). Writer: presentation-writer. Depends on spec 77.

## Tasks

- [x] 1. Add every key of spec 77's Data Models table and `payment_fallback_body` (ID and EN) to `src/translation/locale/id.json` and `en.json` after the `order_*` block, and assert them in `src/infrastructure/i18n/__tests__/i18n.test.ts` [Requirement 6]
- [x] 2. Add `done?: boolean` to `FlowHeaderStep` and `labels.done` to `FlowHeader` ("✓" `aria-hidden`, visually hidden label), with its CSS and test cases; the order header unchanged [Requirement 2]
- [x] 3. Create `PaymentSummary` and `PaymentDock` in `src/presentation/pages/Payment/components/` with their `.module.css` (aside ≥ 720px sticky quiet card; fixed phone dock + spacer; notice roles; shared `Button` with busy label and `aria-describedby`) [Requirement 3, Requirement 4]
- [x] 4. Create `PaymentIntro`, `PaymentProgress` (`role="status"`, reduced-motion spinner), `PaymentMessage` (note box, retry, home link) and `PaymentSkeleton` (`withHeader`) with their `.module.css` [Requirement 5]
- [x] 5. Create the shell `src/presentation/pages/Payment/index.tsx` + `payment.module.css` (import `@infrastructure/di/controllers/payment`, resolve `paymentController`, place the sections per the design) and the route files `src/app/payment/page.tsx` and `src/app/payment/error.tsx` [Requirement 1, Requirement 2]
- [x] 6. Tests: `__tests__/index.test.tsx` for the shell (every state row, placement, no timer) and each of the six sections (roles, names, busy / enabled click, notice roles, note and retry, CSS module checks) [Requirement 2, Requirement 3, Requirement 4, Requirement 5, Requirement 7]
- [ ] 7. Run the gate check, the build (`out/payment.html`, scoped classes, no `midtrans` in any exported HTML), `npm run check:bundle`, and the manual check at 390 and 1440, ID and EN, with the mock scenarios in the design [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3, 4], [5], [6], [7]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run && npm run build && npm run check:bundle`; `npm run lint` (ESLint +
  Stylelint) runs in lint-staged.
- Specs 75–77 land first in the same PR (the views, the controller registration, the mock handlers).
- Sections take no `t`; every text arrives translated in the views.
- HiFi differences (no method list / VA / QRIS, no timer, plain inactive message, fee once per order, legal without
  links, back to home) are listed in the design.
- Figma (optional): file V1VQxA5Ckf82rMppnuMdSw, desktop 54-1152, mobile 54-1570.
- Commit: `feat(payment): [FR-20-W1] add the payment page with midtrans snap`.
