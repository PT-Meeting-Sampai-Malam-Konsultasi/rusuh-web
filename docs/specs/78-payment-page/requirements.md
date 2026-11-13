# Requirements Document

## Introduction

Screen for FR-20-W1 (rusuh-web#19, "Web: Payment page and Midtrans Snap (snap.js)"; parent FR-20,
rusuh-documentation#20; T-07: Midtrans). Adds the `/payment?booking=<id>` route (with its Suspense skeleton and its
segment `error.tsx`) and the `Payment` screen that renders spec 77's views: the flow header with the steps "Pilih tiket
✓ · Bayar · E-tiket", the main column (intro / verifying / message), the "Pesanan" summary aside with "Bayar" (≥ 720px),
the phone dock "Bayar Rp X" (< 720px), and the ID / EN copy. Sources: HiFi `analysis/hifi/src/payment.html` (layout,
aside, dock, verifying and expired sections), Figma file V1VQxA5Ckf82rMppnuMdSw nodes 54-1152 (desktop) and 54-1570
(mobile) as an optional reference, `hifi-api-review.md` H-3 (no in-page method screens), H-4 (refund copy), ADR-0008,
ADR-0010, ADR-0014, `.claude/rules/design-system.md` ("Payment: timer + pay"; "Trust zones (NIK, payment, summary) are
quiet"), `.claude/rules/error-handling.md` (the payment fallback says the held tickets are safe),
`.claude/rules/performance.md` (snap.js only on this screen).

Out of scope (deferred): the countdown in the header (FR-21-W1 / BR-05-W1), the full expired screen with "Antre lagi"
(FR-23-W1), resume beyond reloading the page (NFR-02-W1), the HiFi method list and VA / QRIS sections (H-3).

## Glossary

| Term      | Definition                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Aside     | `PaymentSummary`: the "Pesanan" card; right column with "Bayar" (≥ 720px), flat card under the panel without the button on phones |
| Dock      | `PaymentDock`: the fixed bottom bar on phones (< 720px) with "Bayar Rp X"                                                         |
| Panel     | The main column: `PaymentIntro` (ready / failed / busy), `PaymentProgress` (verifying / leaving), `PaymentMessage`                |
| Done step | A flow step drawn with "✓" instead of its number (step 1 here)                                                                    |

## Requirements

### Requirement 1: Route, fallback and skeleton

**User Story:**

AS a buyer
I WANT `/payment?booking=…` to open fast and never show a white screen
SO THAT I can pay my held tickets calmly

#### Acceptance Criteria

- SHALL add `src/app/payment/page.tsx` (server component): `metadata = { title: 'Pembayaran' }`, `<Suspense
fallback={<PaymentSkeleton withHeader />}><PaymentScreen /></Suspense>`
- SHALL add `src/app/payment/error.tsx` like the order one (logs through `analyticsAdapter.reportError(error, { boundary:
'payment' })`, "Coba lagi" → `retry()`, a home link), with the body `payment_fallback_body` saying the held tickets are
  safe
- SHALL NOT load snap.js from the route, the layout or the providers (the adapter does, on this page only)

### Requirement 2: Shell and flow header

**User Story:**

AS a developer
I WANT the shell to place the sections from the controller's props
SO THAT the page stays props-in / JSX-out

#### Acceptance Criteria

- SHALL add `src/presentation/pages/Payment/index.tsx` (`'use client'`), importing
  `'@infrastructure/di/controllers/payment'` and resolving `paymentController` at the top of render
- SHALL render `FlowHeader` with `steps`, `title`, `backHref`, `homeHref`, the locale switch, the existing labels and a
  new `labels.done`, and no `timer`
- SHALL extend `FlowHeaderStep` with `done?: boolean`: a done step shows "✓" (`aria-hidden`) in its number box and a
  visually hidden `labels.done` after its label; the order page is unchanged
- SHALL render, inside `main`: the panel column (skeleton for `loading`; `PaymentIntro` when `intro`; `PaymentProgress`
  when `progress`; `PaymentMessage` when `message`) and `PaymentSummary` when `summary`; after `</main>`, `PaymentDock`
  when `summary && pay`
- SHALL NOT add hooks or conditions beyond `x && <X />` render guards

### Requirement 3: Summary aside and pay

**User Story:**

AS a buyer on a laptop
I WANT my order and the pay button side by side
SO THAT I check what I pay and pay from the same place

#### Acceptance Criteria

- SHALL render `PaymentSummary` as an `aside` labelled by its `h2` ("Pesanan" + the order code in tabular, muted type),
  the event line, a `ul` of ticket lines (category with "NIK 3174 •••• •••• 0004" under it, amount right), the fee row,
  the total row, the notice (when given), the shared `Button` (full width) when `pay` is given, and the legal note
- SHALL show it from 720px (`display: none` below), sticky like the order aside, quiet: no tilt, halftone or print effect
- The button SHALL be `disabled={!pay.enabled}`, `busy={pay.busy}`, read `pay.busyLabel` while busy and `pay.label`
  otherwise, with an `aria-hidden` "→", and be `aria-describedby` the notice when there is one
- The notice SHALL be `role="alert"` when its tone is `error`, plain text otherwise

### Requirement 4: Phone dock

**User Story:**

AS a buyer on a phone
I WANT "Bayar Rp X" always in reach
SO THAT I can pay without scrolling

#### Acceptance Criteria

- SHALL render `PaymentDock` as a `section` named by `pay.dockRegionLabel`, fixed to the bottom below 720px (the order
  dock's styling), hidden from 720px, with a phone-only spacer so it never covers content
- SHALL show the notice above the button (same `role` rule) and the full-width `Button` with `pay.dockLabel` (or
  `pay.busyLabel` while busy)

### Requirement 5: Panels for every state

**User Story:**

AS a buyer
I WANT the page to say what is happening with my payment
SO THAT I know whether to pay, wait, pay again or start over

#### Acceptance Criteria

- `PaymentIntro`: `h1` with the HiFi step number "2" (`aria-hidden`) + `intro.heading`, the body and the note
- `PaymentProgress`: a `role="status"` region (`aria-live="polite"`) with a spinner (`aria-hidden`; static under
  `prefers-reduced-motion`), an `h1` title, the body and the held line
- `PaymentMessage`: `h1` title, body, the refund note in a quiet note box when given, the retry `Button` when
  `actionLabel`, and a home link
- `PaymentSkeleton`: a same-size placeholder of the panel and the aside, `aria-busy`, with a visually hidden
  `state_loading` label; `withHeader` adds a header placeholder (Suspense fallback)
- SHALL cover: loading, ready, opening (busy button), verifying confirming, verifying waiting (reopen button), failed,
  busy, leaving, inactive (with and without the refund note), not-found, error

### Requirement 6: Copy in both languages

**User Story:**

AS a buyer reading Indonesian or English
I WANT every text of this page in my language
SO THAT the payment reads naturally (ADR-0014)

#### Acceptance Criteria

- SHALL add every key of spec 77's Data Models table and `payment_fallback_body` to `src/translation/locale/id.json`
  and `en.json` with the given copy, same order in both
- SHALL assert their ID and EN values in `src/infrastructure/i18n/__tests__/i18n.test.ts`
- SHALL NOT add a key no file uses

### Requirement 7: Tests and build

**User Story:**

AS a developer
I WANT the sections, the shell and the route covered and the export building
SO THAT the page ships without regressions

#### Acceptance Criteria

- SHALL add `__tests__/index.test.tsx` for the shell and every new section, querying by role and text, `userEvent`
  for clicks; extend the `FlowHeader` test for `done`
- SHALL pass `npm run build` with `out/payment.html` present and scoped class names, and `npm run check:bundle`
- SHALL be checked by hand at 390 and 1440, ID and EN, with the mock scenarios of spec 75
