# Design Document

## Overview

Two new sections on the Order page and the copy for spec 73's keys:

1. **`OrderSummary`**: the HiFi "Ringkasan" aside, in the flow grid's second column (the column `order.module.css`
   already reserves: 340px from 720px, 400px from 1180px). Sticky, quiet card: lines, "Biaya layanan", Total, the
   full-width button, the hint, the 10-minute note.
2. **`OrderDock`**: the HiFi phone dock, fixed to the bottom below 720px: "3 tiket" over "Rp 2.160.000", and "Lanjut bayar
   →". Includes a phone-only spacer so the last holder field is never under it.
3. **Shell**: renders both when `summary && checkout`.
4. **Copy**: 14 keys in `id.json` / `en.json`, asserted in the i18n test.

**Differences from the HiFi, on purpose:**

- **Fee once per order** (ADR-0010, H-1): the HiFi script computes `total × FEE`; the page shows `summary.fee`, the
  event's `adminFee` once. With the HiFi picks that is "Rp 10.000" / "Rp 2.160.000", not "Rp 30.000" / "Rp 2.180.000".
- **A `button`, not an `<a href="payment.html">`**: the action posts the hold first (semantic HTML rule: `button` for
  actions).
- **Hidden with 0 tickets**: the HiFi shows "Belum ada tiket" in the aside and the dock at any count. The brief and spec 73
  show both only with ≥ 1 ticket; the column stays empty at 0 (as today), so nothing tempts a tap that cannot work.
- **A hint line** under the button (and above the dock row) that the HiFi does not have: the disabled state has to say
  why (spec 73), and hold refusals (sold out, over the reservation) land there in red.
- **No "Kirim e-tiket ke" block**: HiFi section 3 is out of this ticket (H-5).

## Architecture

```
src/presentation/pages/Order/index.tsx (shell, 'use client')
  const { …, summary, checkout } = container.resolve<OrderControllerInterface>('orderController');
  <div page>
    <FlowHeader … />
    <main className={styles.main}>
      <div className={styles.flowMain}> …event, categories, holders… </div>
      {summary && checkout && <OrderSummary summary={summary} checkout={checkout} />}     ← grid column 2 (≥ 720px)
    </main>
    {summary && checkout && <OrderDock summary={summary} checkout={checkout} />}          ← fixed bottom (< 720px)
    {timeUpSheet && <OrderTimeUpSheet sheet={timeUpSheet} />}
  </div>
```

Route `/order?event=<id>` (unchanged). No API call in presentation; the tap calls `checkout.onContinue` (spec 73).

Files:

| File                                                                            | Change                                       |
| ------------------------------------------------------------------------------- | -------------------------------------------- |
| `src/presentation/pages/Order/components/OrderSummary/index.tsx`                | new                                          |
| `src/presentation/pages/Order/components/OrderSummary/order-summary.module.css` | new                                          |
| `src/presentation/pages/Order/components/OrderSummary/__tests__/index.test.tsx` | new                                          |
| `src/presentation/pages/Order/components/OrderDock/index.tsx`                   | new                                          |
| `src/presentation/pages/Order/components/OrderDock/order-dock.module.css`       | new                                          |
| `src/presentation/pages/Order/components/OrderDock/__tests__/index.test.tsx`    | new                                          |
| `src/presentation/pages/Order/index.tsx`                                        | render both                                  |
| `src/presentation/pages/Order/order.module.css`                                 | comment update only (the column is used now) |
| `src/presentation/pages/Order/__tests__/index.test.tsx`                         | add cases                                    |
| `src/translation/locale/id.json`, `en.json`                                     | 14 keys                                      |
| `src/infrastructure/i18n/__tests__/i18n.test.ts`                                | assert them                                  |

## Components and Interfaces

```tsx
// src/presentation/pages/Order/components/OrderSummary/index.tsx
import type { OrderCheckoutView, OrderSummaryView } from '@controllers/order.controller';
import Button from '@presentation/components/Button';

import styles from './order-summary.module.css';

interface OrderSummaryProps {
  summary: OrderSummaryView;
  checkout: OrderCheckoutView;
}

/** "Ringkasan" (FR-16-W1): lines, fee once per order, total, "Lanjut ke pembayaran", the hold note. ≥ 720px only. */
export default function OrderSummary({ summary, checkout }: OrderSummaryProps) {
  // <aside className={styles.summary} aria-labelledby="order-summary-heading">
  //   <h2 id="order-summary-heading" className={styles.heading}>{summary.heading}</h2>
  //   <ul className={styles.lines}>{summary.lines.map((l) => <li key={l.key} className={styles.row}><span>{l.label}</span><span>{l.amount}</span></li>)}</ul>
  //   <div className={styles.fee}><span>{summary.feeLabel}</span><span>{summary.fee}</span></div>
  //   <div className={styles.total}><span>{summary.totalLabel}</span><strong>{summary.total}</strong></div>
  //   <Button fullWidth disabled={!checkout.enabled} busy={checkout.busy} onClick={checkout.onContinue}
  //           aria-describedby={checkout.hint ? 'order-summary-hint' : undefined}>
  //     {checkout.label} <span aria-hidden="true">→</span>
  //   </Button>
  //   {checkout.hint && <p id="order-summary-hint" className={checkout.hint.error ? styles.hintError : styles.hint}
  //                        role={checkout.hint.error ? 'alert' : undefined}>{checkout.hint.text}</p>}
  //   <p className={styles.note}>{summary.note}</p>
  // </aside>
}
```

```tsx
// src/presentation/pages/Order/components/OrderDock/index.tsx
import type { OrderCheckoutView, OrderSummaryView } from '@controllers/order.controller';
import Button from '@presentation/components/Button';

import styles from './order-dock.module.css';

interface OrderDockProps {
  summary: OrderSummaryView;
  checkout: OrderCheckoutView;
}

/** The phone bar (FR-16-W1): "3 tiket · Rp 2.160.000 · Lanjut bayar →", fixed to the bottom below 720px. */
export default function OrderDock({ summary, checkout }: OrderDockProps) {
  // <>
  //   <div className={styles.spacer} aria-hidden="true" />
  //   <section className={styles.dock} aria-label={summary.dockLabel}>
  //     {checkout.hint && <p id="order-dock-hint" className={…} role={checkout.hint.error ? 'alert' : undefined}>{checkout.hint.text}</p>}
  //     <div className={styles.row}>
  //       <p className={styles.amount}><span className={styles.count}>{summary.ticketCount}</span><strong>{summary.total}</strong></p>
  //       <Button className={styles.button} disabled={!checkout.enabled} busy={checkout.busy} onClick={checkout.onContinue}
  //               aria-describedby={checkout.hint ? 'order-dock-hint' : undefined}>
  //         {checkout.shortLabel} <span aria-hidden="true">→</span>
  //       </Button>
  //     </div>
  //   </section>
  // </>
}
```

Two `role="alert"` regions with the same text exist in the DOM (aside and dock); only one is displayed at a width, and
`display: none` removes the hidden one from the accessibility tree, so a screen reader announces it once. The ids differ
(`order-summary-hint`, `order-dock-hint`).

Compile check: `OrderSummaryView`, `OrderCheckoutView` and `OrderCheckoutHint` are exported by spec 73; `Button` accepts
`fullWidth`, `busy`, `disabled`, `className`, `onClick` and any `button` attribute (`aria-describedby`).

## Data Models

Layout (from `assets/flow.css` and `rusuh.css`, ported to tokens):

| Element                | Phone (< 720px)                                                                                                                                                           | ≥ 720px                                                                                                                                | ≥ 1180px            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `.summary` (aside)     | `display: none`                                                                                                                                                           | block; `position: sticky; top: 120px`; `border: 2.5px solid ink`; `bg-card`; padding `26px 26px 24px`; `box-shadow: var(--shadow-off)` | same (column 400px) |
| `.heading`             | —                                                                                                                                                                         | display S: `font-display` 700, 22px, stretch 85%                                                                                       | same                |
| `.lines`               | —                                                                                                                                                                         | `mt-4`, top border 1px `hair`                                                                                                          | same                |
| `.row`, `.fee`         | —                                                                                                                                                                         | flex space-between, gap 12px, `py-2.5`, bottom border 1px `hair`, 15px, tabular-nums; `.fee` in `ink-2`                                | same                |
| `.total`               | —                                                                                                                                                                         | flex space-between baseline, `mt-[18px] mb-[22px]`; label 600; amount `font-display` 800 38px/1, stretch 75%, tabular-nums             | same                |
| `.hint` / `.hintError` | —                                                                                                                                                                         | 13px, `mt-3`; `ink-2` / `red` with a "!" mark via `::before`                                                                           | same                |
| `.note`                | —                                                                                                                                                                         | 13px, `ink-2`, `mt-4`, line-height 1.5                                                                                                 | same                |
| `.dock`                | `fixed inset-x-0 bottom-0 z-30`; `bg-paper`; `border-t-[2.5px] border-ink`; padding `12px 16px calc(14px + env(safe-area-inset-bottom))`                                  | `display: none`                                                                                                                        | —                   |
| `.row` (dock)          | flex, items-center, space-between, gap 14px                                                                                                                               | —                                                                                                                                      | —                   |
| `.count` / `strong`    | 13px `ink-2` / `font-display` 800 26px/1 stretch 75%, tabular-nums; stacked (`grid`)                                                                                      | —                                                                                                                                      | —                   |
| `.button` (dock)       | `flex: 1; max-width: 210px; padding: 0 16px`                                                                                                                              | —                                                                                                                                      | —                   |
| `.spacer`              | height 130px fixed (HiFi `.flow-grid` phone `padding-bottom: 130px`); no extra height when the hint shows, since the hint is one short line inside the dock's own padding | `display: none`                                                                                                                        | —                   |

Interactive states come from the shared `Button` (hover, focus-visible, disabled, pressed, busy). Colours: ink actions,
no pink or blue fills in the summary (trust zone; pink only stays on the Button's own offset).

Copy (spec 73 Data Models, written here):

| Key                           | ID                                                                                               | EN                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `order_summary_heading`       | Ringkasan                                                                                        | Summary                                                                                 |
| `order_summary_line`          | {{quantity}} × {{category}}                                                                      | {{quantity}} × {{category}}                                                             |
| `order_summary_fee`           | Biaya layanan                                                                                    | Service fee                                                                             |
| `order_summary_total`         | Total                                                                                            | Total                                                                                   |
| `order_summary_note`          | Tiket ditahan untuk Anda selama 10 menit saat Anda lanjut. Belum ada biaya sampai Anda membayar. | We hold the tickets for 10 minutes once you continue. Nothing is charged until you pay. |
| `order_summary_tickets_one`   | {{count}} tiket                                                                                  | {{count}} ticket                                                                        |
| `order_summary_tickets_other` | {{count}} tiket                                                                                  | {{count}} tickets                                                                       |
| `order_summary_dock_label`    | Ringkasan pesanan                                                                                | Order summary                                                                           |
| `order_checkout_label`        | Lanjut ke pembayaran                                                                             | Continue to payment                                                                     |
| `order_checkout_short_label`  | Lanjut bayar                                                                                     | Continue                                                                                |
| `order_checkout_hint_holders` | Lengkapi data pemegang tiket untuk lanjut.                                                       | Complete the ticket holders' details to continue.                                       |
| `order_hold_sold_out`         | {{category}} sudah habis. Kurangi tiketnya atau pilih kategori lain.                             | {{category}} has sold out. Remove those tickets or pick another category.               |
| `order_hold_over_reservation` | Jumlah tiket melebihi kuota giliran Anda. Kurangi tiketnya lalu lanjut lagi.                     | You picked more tickets than your turn allows. Remove some and continue again.          |
| `order_hold_open_active`      | Buka pesanan itu                                                                                 | Open that order                                                                         |

Place them after `order_nik_recheck` in both files (same order). Every `error_*` text the page can show already exists.

Page states (App Flow "Detail Ticket" F2–F20, F15; ADR-0005):

| State                                            | Aside (≥ 720px)                                  | Dock (< 720px)                       |
| ------------------------------------------------ | ------------------------------------------------ | ------------------------------------ |
| loading / error / not-found                      | none                                             | none                                 |
| ready, 0 tickets                                 | none (empty column)                              | none                                 |
| ≥ 1 ticket, holders incomplete                   | lines, fee, total; disabled button; neutral hint | count, total; disabled; neutral hint |
| all holders verified                             | enabled, no hint                                 | enabled, no hint                     |
| hold in flight                                   | busy button + global overlay                     | busy + overlay                       |
| hold refused (sold out / over reservation / NIK) | disabled; red hint (`role="alert"`)              | same                                 |
| retryable / active booking / not held            | global error popup over the page                 | same                                 |
| held, navigating                                 | busy until the route changes                     | same                                 |
| time's up                                        | none (the sheet)                                 | none                                 |

## Layer Constraints

From `.claude/rules/presentation.md`:

- `'use client'` at the top.
- Zero hooks and zero logic of their own: `container.resolve<Interface>('xController')` at the top of render, then pass
  props to sections.
- One shell per page, co-located `{page-name}.module.css`.
- Receive all data and callbacks as props, including `t`. Never call `useTranslation()` or `container.resolve()`.
- May hold visual micro-state only (accordion open, tooltip). Business state (step, modal triggered by the API) lives in
  the controller.
- Plain function declarations with a typed props interface; no `React.FC`, no `forwardRef` (React 19: `ref` is a prop).
- `export default` for every component.
- Semantic HTML: `main`, `section`, `h1`…, `button` for actions (never `div onClick`), `form` with labels.
- Every `.tsx` has a co-located `.module.css`.
- First line of every module: `@reference "<relative path>/styles/app.css";` (needed for `@apply` and theme tokens).
- `camelCase` class names; style with `@apply` and theme tokens; raw CSS only where Tailwind has no utility
  (e.g. `font-stretch`, keyframes, `text-shadow` plates).
- **No Tailwind class strings in JSX**, no inline `style` except CSS variables for dynamic values
  (`style={{ '--progress': `${p}%` }}`), no Sass, no CSS-in-JS.
- Mobile first: base styles target the phone (390), then `@variant md` / `lg` (or `@media (width >= …)`) for wider.
- Interactive elements define `:hover`, `:focus-visible`, `:disabled` and pressed states.
- Live regions: the queue number and ETA (`aria-live="polite"`), field errors (`role="alert"`), timers (`role="timer"`).
- Status never by colour alone: word + style.
- Focus visible on everything interactive; targets ≥ 44px; respects `prefers-reduced-motion`.
- `__tests__/index.test.tsx` for every page shell and section.
- React Testing Library; query by role and text, not test id; `userEvent` for interaction; mock `t` as `(k) => k`.
- Shells: mock `container.resolve` and assert props reach the sections.
- ❌ Hooks or conditions in a page shell
- ❌ `useTranslation()` or `container.resolve()` in a section
- ❌ Tailwind classes in JSX, missing `.module.css`, missing `@reference`
- ❌ Direct imports from `@core/` or `@infrastructure/`
- ❌ `React.FC`, `forwardRef`, named component exports
- ❌ `div` buttons, images without `alt`/size, barrel `index.ts` re-exports

Note: the shell's `summary && checkout &&` is the same kind of render guard as the existing `status === 'ready' && …`
and `timeUpSheet && …` (no hook, no computed logic). The sections take no `t`: every text arrives translated in the
views (as `OrderTimeUpSheet` does).

From `.claude/rules/design-system.md`:

- One loud thing per screen (Home: poster · Waiting room: your number · Detail: picks + timer · Payment: timer + pay ·
  E-ticket: "Sampai jumpa").
- Colour has a job: **pink = you**, **blue = the event**, **ink = actions**. Never swap.
- Trust zones (NIK, payment, summary) are quiet: no tilt, no halftone behind text.
- Border width 2.5px ink; offsets 6px (cards, posters) and 4px (buttons, focus), 0 blur, in ink, pink or blue.
- Tabular figures for anything that changes (numbers, timers, money). Smallest text 12.5px.
- **Button:** ink plate + pink offset; press sinks into the shadow (90ms in, 150ms out); min height 56 web / 54 phone.
- Short, warm, "Anda". ID first, full EN translation. Formats: `1.248`, `Rp 2.180.000`, `19.00 WIB`, `Sab, 12 Des 2026`
  (EN `1,248`, `Rp 2,180,000`, `7.00 pm WIB`, `Sat, 12 Dec 2026`). NIK masked as first 4 + last 4.

From `.claude/rules/scaffold.md`:

- Resources: `src/translation/locale/id.json` and `en.json`, same keys in both, flat `snake_case`, single namespace.
- Copy comes from the HiFi / Design Brief voice rules; write ID first, then a full EN translation.

From `.claude/rules/performance.md`:

- Above-the-fold content is never behind a dynamic import.
- Total CSS ≤ 30 KB (enforced); a PR that grows first-load JS of a route by > 5 KB states why.

## Correctness Properties

- Property 1: `OrderSummary` renders a `complementary` landmark named by the heading, one `listitem` per line with its
  label and amount, the fee and total rows, the button named "Lanjut ke pembayaran" (arrow not in the name) and the note.
  **Validates: Requirements 1**
- Property 2: with `enabled: false` both buttons are disabled; with `busy: true` both are disabled and have `aria-busy`;
  with `enabled: true` one click calls `onContinue` once. **Validates: Requirements 1, 2, 4**
- Property 3: a hint with `error: true` is a `role="alert"` and the button's description; `error: false` has no alert role;
  no hint → no description. **Validates: Requirements 1, 2, 4**
- Property 4: `OrderDock` renders a region named by `dockLabel` with the count, the total and the button named "Lanjut
  bayar". **Validates: Requirements 2**
- Property 5: the shell renders both sections exactly when `summary` and `checkout` are non-null; the aside is inside
  `main` after the flow column; the dock is outside `main`; the time's-up sheet still renders after them.
  **Validates: Requirements 3**
- Property 6: the CSS modules start with `@reference`, use `@variant md` for the aside / dock switch and contain no hex
  colour literal. **Validates: Requirements 1, 2**
- Property 7: `id.json` and `en.json` have the 14 keys with the table's values (the i18n test's key-parity check stays
  green); `i18next` gives "1 ticket" / "3 tickets" and "1 tiket" / "3 tiket". **Validates: Requirements 5**
- Property 8: `npm run build` passes, `out/order.html` has scoped class names, `npm run check:bundle` passes.
  **Validates: Requirements 6**

## Error Handling

Presentation shows only what spec 73 hands over: the hint (neutral or `role="alert"`) for disabled and refused states;
popups (retryable, active booking, not held, rethrown errors) come from the global `ErrorPopup` with "Kode bantuan"; field
errors stay in `HolderList` (unchanged); the time's-up sheet replaces both sections. No error code is mapped here.

## Testing Strategy

- `OrderSummary/__tests__/index.test.tsx`: Properties 1–3 with a fixture view (two lines, fee, total, hint variants);
  `userEvent.click`; a CSS module check like the other Order sections.
- `OrderDock/__tests__/index.test.tsx`: Properties 2–4.
- `src/presentation/pages/Order/__tests__/index.test.tsx`: Property 5 (`base()` already has `summary: null, checkout:
null` from spec 73; add a `withCheckout()` fixture).
- `src/infrastructure/i18n/__tests__/i18n.test.ts`: Property 7.
- Gate: `npx tsc --noEmit && npx vitest --run && npm run build && npm run check:bundle`; `npm run lint` (ESLint +
  Stylelint) in lint-staged.
- Manual: `npm run dev` with the mock, `/order?event=evt_samudra` at 390×844 and 1440×900, ID and EN, against
  `analysis/hifi/shots/detail/default-*.png`: 0 → 1 → 3 tickets (aside / dock appear), holders incomplete (hint),
  verified (enabled), tap (overlay, then the not-found page at `/payment?booking=bk_mock_1` until FR-20-W1),
  `?mock=category_sold_out`, `?mock=nik_seat_taken`, `?mock=payment_busy` (popup, "Coba lagi" succeeds), and
  `?mock=short_window` (no aside / dock under the sheet).
