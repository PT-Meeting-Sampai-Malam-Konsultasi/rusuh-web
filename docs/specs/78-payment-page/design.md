# Design Document

## Overview

The `/payment` route and the `Payment` screen:

1. **Route** `src/app/payment/page.tsx` (Suspense + `PaymentSkeleton withHeader`) and `src/app/payment/error.tsx`.
2. **Shell** `src/presentation/pages/Payment/index.tsx` + `payment.module.css`: `FlowHeader`, the flow grid (panel
   column + aside), the dock.
3. **Sections** in `src/presentation/pages/Payment/components/`: `PaymentIntro`, `PaymentProgress`, `PaymentMessage`,
   `PaymentSummary`, `PaymentDock`, `PaymentSkeleton`.
4. **Shared change**: `FlowHeaderStep.done` and `labels.done` in `src/presentation/components/FlowHeader`.
5. **Copy**: spec 77's keys + `payment_fallback_body`, ID and EN.

**Differences from the HiFi, on purpose (ADRs win):**

- **No method list, VA or QRIS sections** (H-3, ADR-0008): the main column shows `PaymentIntro` ("Bayar dengan Midtrans");
  the customer picks the method on Snap. The aside button is "Bayar", not "Bayar dengan QRIS"; the dock is "Bayar Rp X",
  not "Bayar Rp X · QRIS".
- **No timer** in the header or app bar (FR-21-W1 deferred). The design-system "Payment: timer + pay" loud thing is
  therefore only "pay" for now: the `Button` is the one strong element; everything else is quiet.
- **Expired** is a plain `PaymentMessage` ("Pesanan ini sudah tidak aktif." + home), not the HiFi's stamp, display-XL
  "Pesanan dibatalkan." and "Antre lagi" (FR-23-W1). The refund note uses H-4's "akan kami kembalikan".
- **Fee once per order** (ADR-0010): `summary.fee` is the view's `adminFee` ("Rp 10.000" in the mock), not the HiFi's
  per-ticket "Rp 30.000".
- **Legal note without links**: no Terms / Refund Policy pages exist yet; the sentence is plain text.
- **Back link** goes home (spec 77: the view has no event id).

## Architecture

```
src/app/payment/page.tsx (server)
  <Suspense fallback={<PaymentSkeleton withHeader />}> <PaymentScreen /> </Suspense>

src/presentation/pages/Payment/index.tsx ('use client')
  import '@infrastructure/di/controllers/payment';
  const { t, state, steps, title, intro, summary, pay, notice, progress, message, homeHref, backHref, locale, setLocale }
    = container.resolve<PaymentControllerInterface>('paymentController');
  <div page>
    <FlowHeader steps … labels={{ home, steps, language, back, done }} />            (no timer)
    <main className={styles.main} aria-busy={state === 'loading'}>
      <div className={styles.flowMain}>
        {state === 'loading' && <PaymentSkeleton label={t('state_loading')} />}
        {intro && <PaymentIntro intro={intro} />}
        {progress && <PaymentProgress progress={progress} />}
        {message && <PaymentMessage message={message} />}
      </div>
      {summary && <PaymentSummary summary={summary} pay={pay} notice={notice} />}   ← grid column 2 (≥ 720px)
    </main>
    {summary && pay && <PaymentDock pay={pay} notice={notice} />}                   ← fixed bottom (< 720px)
  </div>
```

The notice is rendered in the aside (≥ 720px) and in the dock (< 720px); only one is displayed at a width, and `display:
none` removes the other from the accessibility tree (the pattern of spec 74's two hints). The ids differ
(`payment-summary-notice`, `payment-dock-notice`).

No API call and no Snap call in presentation: the buttons call `pay.onPay` (spec 77).

Files:

| File                                                                                               | Change                                   |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `src/app/payment/page.tsx`, `src/app/payment/error.tsx`                                            | new                                      |
| `src/presentation/pages/Payment/index.tsx`, `payment.module.css`                                   | new                                      |
| `src/presentation/pages/Payment/components/{Section}/index.tsx` + `{section}.module.css`           | new, six sections                        |
| `src/presentation/pages/Payment/__tests__/index.test.tsx`, `components/*/__tests__/index.test.tsx` | new                                      |
| `src/presentation/components/FlowHeader/index.tsx`, `flow-header.module.css`, its test             | `done` step, `labels.done`               |
| `src/translation/locale/id.json`, `en.json`                                                        | spec 77's keys + `payment_fallback_body` |
| `src/infrastructure/i18n/__tests__/i18n.test.ts`                                                   | assert them                              |

## Components and Interfaces

```tsx
// src/presentation/components/FlowHeader/index.tsx (changes)
export interface FlowHeaderStep {
  number: 1 | 2 | 3;
  label: string;
  current: boolean;
  /** Finished step: "✓" instead of the number, plus labels.done for screen readers. */
  done?: boolean;
}
// labels: { home: string; steps: string; language: string; back: string; done?: string }
// <li … className={step.done ? styles.stepDone : styles.step}>
//   <b className={styles.stepNumber} aria-hidden={step.done || undefined}>{step.done ? '✓' : step.number}</b>
//   {step.label}
//   {step.done && labels.done && <span className={styles.srOnly}> ({labels.done})</span>}
// </li>
```

```tsx
// src/presentation/pages/Payment/components/PaymentSummary/index.tsx
import type { PaymentActionView, PaymentNotice, PaymentSummaryView } from '@controllers/payment.controller';
import Button from '@presentation/components/Button';

import styles from './payment-summary.module.css';

interface PaymentSummaryProps {
  summary: PaymentSummaryView;
  /** null while verifying (confirming) or leaving: no button then. */
  pay: PaymentActionView | null;
  notice: PaymentNotice | null;
}

/** "Pesanan" (FR-20-W1): order code, event, one line per ticket, fee once, total, Bayar, legal. On phones a flat card without the notice and button (user decision, 13 Nov: follow the HiFi). */
export default function PaymentSummary({ summary, pay, notice }: PaymentSummaryProps) {
  // <aside className={styles.summary} aria-labelledby="payment-summary-heading">
  //   <h2 id="payment-summary-heading" className={styles.heading}>{summary.heading} <span className={styles.orderCode}>{summary.orderCode}</span></h2>
  //   {summary.eventLine && <p className={styles.event}>{summary.eventLine}</p>}
  //   <ul className={styles.lines}>{summary.lines.map((l) => (
  //     <li key={l.key} className={styles.row}><span>{l.category}<small className={styles.nik}>{l.nik}</small></span><span>{l.amount}</span></li>))}</ul>
  //   <div className={styles.fee}><span>{summary.feeLabel}</span><span>{summary.fee}</span></div>
  //   <div className={styles.total}><span>{summary.totalLabel}</span><strong>{summary.total}</strong></div>
  //   {notice && <p id="payment-summary-notice" className={notice.tone === 'error' ? styles.noticeError : styles.notice}
  //                 role={notice.tone === 'error' ? 'alert' : undefined}>{notice.text}</p>}
  //   {pay && <Button fullWidth disabled={!pay.enabled} busy={pay.busy} onClick={pay.onPay}
  //                   aria-describedby={notice ? 'payment-summary-notice' : undefined}>
  //             {pay.busy ? pay.busyLabel : pay.label} <span aria-hidden="true">→</span></Button>}
  //   <p className={styles.legal}>{summary.legal}</p>
  // </aside>
}
```

```tsx
// …/PaymentDock/index.tsx
interface PaymentDockProps {
  pay: PaymentActionView;
  notice: PaymentNotice | null;
}
/** Phone bar (FR-20-W1): "Bayar Rp 2.160.000 →", fixed to the bottom below 720px. */
export default function PaymentDock({ pay, notice }: PaymentDockProps);
// <><div className={styles.spacer} aria-hidden="true" />
//   <section className={styles.dock} aria-label={pay.dockRegionLabel}>
//     {notice && <p id="payment-dock-notice" className={…} role={notice.tone === 'error' ? 'alert' : undefined}>{notice.text}</p>}
//     <Button fullWidth disabled={!pay.enabled} busy={pay.busy} onClick={pay.onPay}
//             aria-describedby={notice ? 'payment-dock-notice' : undefined}>
//       {pay.busy ? pay.busyLabel : pay.dockLabel} <span aria-hidden="true">→</span></Button>
//   </section></>

// …/PaymentIntro/index.tsx
interface PaymentIntroProps {
  intro: PaymentIntroView;
}
/** "2 Bayar dengan Midtrans" + how it works. */
export default function PaymentIntro({ intro }: PaymentIntroProps);
// <section className={styles.intro} aria-labelledby="payment-intro-heading">
//   <h1 id="payment-intro-heading" className={styles.heading}><span className={styles.number} aria-hidden="true">2</span>{intro.heading}</h1>
//   <p className={styles.body}>{intro.body}</p><p className={styles.note}>{intro.note}</p></section>

// …/PaymentProgress/index.tsx
interface PaymentProgressProps {
  progress: PaymentProgressView;
}
/** Verifying / waiting / paid (HiFi "verifying" section). */
export default function PaymentProgress({ progress }: PaymentProgressProps);
// <section className={styles.progress} role="status" aria-live="polite">
//   <div className={styles.spin} aria-hidden="true" /><h1 className={styles.title}>{progress.title}</h1>
//   <p className={styles.body}>{progress.body}</p>{progress.held && <p className={styles.held}>{progress.held}</p>}</section>

// …/PaymentMessage/index.tsx
interface PaymentMessageProps {
  message: PaymentMessageView;
}
/** No longer active / not found / load error, with home (FR-23-W1 builds the full expired screen). */
export default function PaymentMessage({ message }: PaymentMessageProps);
// <section className={styles.message}><h1 className={styles.title}>{message.title}</h1><p className={styles.body}>{message.body}</p>
//   {message.note && <p className={styles.note}>{message.note}</p>}
//   <div className={styles.actions}>{message.actionLabel && message.onAction && <Button onClick={message.onAction}>{message.actionLabel}</Button>}
//   <Link className={styles.link} href={message.homeHref}>{message.homeLabel}</Link></div></section>

// …/PaymentSkeleton/index.tsx
interface PaymentSkeletonProps {
  /** Visually hidden "Memuat…"; omitted in the Suspense fallback (no translations there). */
  label?: string;
  /** Adds a header placeholder (Suspense fallback). */
  withHeader?: boolean;
}
/** Same-size placeholder of the panel and the aside. */
export default function PaymentSkeleton({ label, withHeader }: PaymentSkeletonProps);
```

```tsx
// src/app/payment/page.tsx
import { Suspense } from 'react';

import PaymentScreen from '@presentation/pages/Payment';
import PaymentSkeleton from '@presentation/pages/Payment/components/PaymentSkeleton';

export const metadata = { title: 'Pembayaran' };

// The controller reads ?booking=, so the screen renders on the client behind a same-size fallback.
export default function Page() {
  return (
    <Suspense fallback={<PaymentSkeleton withHeader />}>
      <PaymentScreen />
    </Suspense>
  );
}

// src/app/payment/error.tsx — the shape of src/app/order/error.tsx with boundary 'payment',
// title i18n.t('error_page_title') and body i18n.t('payment_fallback_body').
```

Compile check: every view type is exported by spec 77 (`PaymentActionView`, `PaymentNotice`, `PaymentSummaryView`,
`PaymentIntroView`, `PaymentProgressView`, `PaymentMessageView`, `PaymentControllerInterface`); `Button` accepts
`fullWidth`, `busy`, `disabled`, `onClick` and `aria-*` (as in spec 74); `PaymentFlowStep` is assignable to
`FlowHeaderStep` once `done?` exists; `Link` from `next/link` as in `OrderMessage`. The shell test mocks
`'@infrastructure/di/controllers/payment'` like the order shell test; `registry.test.ts`'s "every page shell imports
its registration" check now finds `paymentController` in `di/controllers/payment.ts`.

## Data Models

Layout (HiFi `assets/flow.css` / `rusuh.css`, the order page's grid and aside tokens):

| Element                     | Phone (< 720px)                                                                                                              | ≥ 720px                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `.main` (shell)             | the order page's flow grid, one column, 16px gutters                                                                         | two columns: panel + aside (340px; 400px from 1180px), as `order.module.css`   |
| `PaymentIntro` `.heading`   | display M, `font-display` 800, stretch 85%; `.number` an ink square "2"                                                      | same                                                                           |
| `PaymentProgress`           | centred block, 48px ink ring spinner (static under reduced motion), display L title                                          | same                                                                           |
| `PaymentMessage`            | left-aligned, display L title; `.note` box: 2.5px ink border, `bg-card`, 14px                                                | same                                                                           |
| `PaymentSummary` `.summary` | flat card under the panel (2.5px ink border, `bg-card`, no shadow); `.action` (notice + Bayar) hidden: the dock carries them | sticky `top: 120px`, 2.5px ink border, `bg-card`, padding 26px, `--shadow-off` |
| `.orderCode`                | —                                                                                                                            | tabular-nums, `ink-3`, 0.8em                                                   |
| `.event`                    | —                                                                                                                            | 13px caps label, `ink-2`                                                       |
| `.row` / `.nik`             | —                                                                                                                            | flex space-between, `py-2.5`, hair border; `.nik` block 13px `ink-2` tabular   |
| `.fee`, `.total`            | —                                                                                                                            | as `OrderSummary` (total: display 38px stretch 75%, tabular)                   |
| `.notice` / `.noticeError`  | (dock) 13px                                                                                                                  | 13px `mt-3`; `ink-2` / `red` with a "!" mark (word + colour)                   |
| `.legal`                    | —                                                                                                                            | 13px `ink-2`, `mt-4`, line-height 1.5                                          |
| `PaymentDock` `.dock`       | fixed bottom, `bg-paper`, 2.5px ink top border, padding `12px 16px calc(14px + env(safe-area-inset-bottom))`                 | `display: none`                                                                |
| `.spacer`                   | 110px (one button + one notice line)                                                                                         | `display: none`                                                                |
| `PaymentSkeleton`           | blocks in `paper-2`, the sizes of intro + aside                                                                              | same                                                                           |

Colours: ink for the pay action (the shared `Button`: ink plate, pink offset); no pink or blue fills in the summary,
intro or progress (trust zone); red only for the error notice, always with its words.

Copy: every key of spec 77's Data Models table, plus:

| Key                     | ID                                                                                       | EN                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `payment_fallback_body` | Halaman pembayaran gagal dimuat. Tiket Anda tetap ditahan; coba lagi atau kembali nanti. | The payment page didn't load. Your tickets are still held; try again or come back soon. |

Place them after the `order_*` block in both files, same order.

Page states (spec 77's state table):

| State                    | Panel column                           | Aside (≥ 720px)                   | Dock (< 720px)         |
| ------------------------ | -------------------------------------- | --------------------------------- | ---------------------- |
| loading                  | skeleton                               | none                              | none                   |
| ready                    | intro                                  | summary + "Bayar →"               | "Bayar Rp X →"         |
| opening                  | intro                                  | busy button "Membuka pembayaran…" | same, busy             |
| verifying, confirming    | progress "Memastikan pembayaran Anda…" | summary, no button                | none                   |
| verifying, waiting       | progress "Menunggu pembayaran Anda"    | summary + "Buka lagi pembayaran"  | "Buka lagi pembayaran" |
| failed                   | intro                                  | red notice + "Bayar lagi"         | notice + "Bayar lagi"  |
| busy                     | intro                                  | red notice + "Coba lagi"          | notice + "Coba lagi"   |
| leaving                  | progress "Pembayaran diterima."        | summary, no button                | none                   |
| inactive (± refund note) | message + home                         | none                              | none                   |
| not-found                | message + home                         | none                              | none                   |
| error                    | message + "Coba lagi" + home           | none                              | none                   |

## Layer Constraints

From `.claude/rules/presentation.md`:

- Server components (no `'use client'`). Only: `export const metadata` (or `generateMetadata` for static values) and
  rendering the screen from `@presentation/pages/...`.
- If the screen's controller reads search params, wrap it: `<Suspense fallback={<ScreenSkeleton />}><Screen /></Suspense>`.
  Without it the whole tree falls back to client rendering.
- No data fetching, no logic, no hooks.
- Every flow segment has an `error.tsx` (see the error-handling rule).
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
- ❌ `'use client'` or logic in a route file
- ❌ Hooks or conditions in a page shell
- ❌ `useTranslation()` or `container.resolve()` in a section
- ❌ Tailwind classes in JSX, missing `.module.css`, missing `@reference`
- ❌ Direct imports from `@core/` or `@infrastructure/`
- ❌ `React.FC`, `forwardRef`, named component exports
- ❌ `div` buttons, images without `alt`/size, barrel `index.ts` re-exports

Notes: the shell's `x && <X />` guards and `state === 'loading'` are render guards like the order shell's, not logic.
Sections take no `t`: every text arrives translated in the views (as `OrderSummary`). The shell's
`import '@infrastructure/di/controllers/payment'` and `container` import are the scaffold rule's required page wiring,
as in the order shell.

From `.claude/rules/error-handling.md`:

- Error files are client components (`'use client'`) and receive `{ error: unknown, retry: () => void }` in this
  Next.js version (not `reset`). Check `node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md`.
- Fallbacks are static: no API calls, no DI resolution, no hooks beyond logging in `useEffect`.
- Log the error (analytics adapter or `reportError`) before showing the fallback. Never show stack traces or status codes.
- Segment fallback keeps the layout and offers "Coba lagi" (`retry()`) and a way back (Home).
- In the queue and payment segments, the fallback says the place / held tickets are safe and how to return
  ("Nomor Anda tetap aman").

Note: `order/error.tsx` resolves `analyticsAdapter` inside its logging `useEffect`; the payment fallback follows that
existing pattern for the log only.

From `.claude/rules/design-system.md`:

- One loud thing per screen (Home: poster · Waiting room: your number · Detail: picks + timer · Payment: timer + pay ·
  E-ticket: "Sampai jumpa").
- Colour has a job: **pink = you**, **blue = the event**, **ink = actions**. Never swap.
- Trust zones (NIK, payment, summary) are quiet: no tilt, no halftone behind text.
- Border width 2.5px ink; offsets 6px (cards, posters) and 4px (buttons, focus), 0 blur, in ink, pink or blue.
- Tabular figures for anything that changes (numbers, timers, money). Smallest text 12.5px.
- **Button:** ink plate + pink offset; press sinks into the shadow (90ms in, 150ms out); min height 56 web / 54 phone.
- **Snap:** our page only; Snap's UI is Midtrans's (theme colour `--color-pink-ink`).
- Short, warm, "Anda". ID first, full EN translation. Formats: `1.248`, `Rp 2.180.000`, `19.00 WIB`, `Sab, 12 Des 2026`
  (EN `1,248`, `Rp 2,180,000`, `7.00 pm WIB`, `Sat, 12 Dec 2026`). NIK masked as first 4 + last 4.

Note: Snap's theme colour is set in the Midtrans dashboard, not by this page.

From `.claude/rules/performance.md`:

- Load page-specific libraries (Snap, QR, PDF) with `next/dynamic`, never in providers.
- Load `snap.js` only on the payment screen, `afterInteractive`, never in `<head>` of every page.
- Above-the-fold content is never behind a dynamic import.
- A PR that grows first-load JS of a route by > 5 KB states why.

From `.claude/rules/scaffold.md`:

- Resources: `src/translation/locale/id.json` and `en.json`, same keys in both, flat `snake_case`, single namespace.
- Copy comes from the HiFi / Design Brief voice rules; write ID first, then a full EN translation.

## Correctness Properties

- Property 1: `PaymentSummary` renders a `complementary` landmark named "Pesanan RSH-…", one `listitem` per ticket with
  its category, NIK text and amount, the fee and total rows, the legal note, and the button named by `pay.label` (arrow
  not in the name); with `pay: null` no button. **Validates: Requirements 3**
- Property 2: with `busy: true` both buttons are disabled, `aria-busy`, and read `busyLabel`; with `enabled: true` one
  click calls `onPay` once. **Validates: Requirements 3, 4, 5**
- Property 3: an error-tone notice is a `role="alert"` and the button's description; an info-tone notice has no alert
  role. **Validates: Requirements 3, 4**
- Property 4: `PaymentDock` renders a region named by `dockRegionLabel` with the button named by `dockLabel`.
  **Validates: Requirements 4**
- Property 5: `PaymentProgress` is a `status` region with its title (`heading` level 1), body and held line; the held line
  is absent when `''`. `PaymentMessage` shows the note only when given and the retry button only with `actionLabel`.
  **Validates: Requirements 5**
- Property 6: for each row of the page-state table the shell renders exactly the listed sections (a `base()` fixture per
  state); the aside is inside `main` after the panel column; the dock is outside `main`; no `timer` role exists.
  **Validates: Requirements 2, 5**
- Property 7: `FlowHeader` with `done: true` shows "✓" hidden from assistive tech and the hidden "(selesai)"; the order
  page's header test still passes. **Validates: Requirements 2**
- Property 8: `id.json` and `en.json` contain every new key with the tables' values; the key-parity test stays green.
  **Validates: Requirements 6**
- Property 9: the CSS modules start with `@reference`, switch aside / dock with `@variant md`, contain no hex literal, and
  stop the spinner under `prefers-reduced-motion`. **Validates: Requirements 3, 4, 5**
- Property 10: `npm run build` emits `out/payment.html` with scoped class names; no exported HTML references
  `midtrans`; `npm run check:bundle` passes. **Validates: Requirements 1, 7**

## Error Handling

Presentation maps no code: it shows what spec 77 hands over — the notice (failed / busy) in the aside and the dock,
`PaymentMessage` for inactive / not-found / load error, the global `ErrorPopup` (with "Kode bantuan") for rethrown pay
errors, and `src/app/payment/error.tsx` for a crash ("Ada yang tidak beres." + `payment_fallback_body` + "Coba lagi" +
"Ke beranda").

## Testing Strategy

- Section tests (`components/*/__tests__/index.test.tsx`): Properties 1–5 with fixture views; `userEvent.click`; a CSS
  module check like the order sections.
- `src/presentation/pages/Payment/__tests__/index.test.tsx`: mock `container.resolve` and
  `'@infrastructure/di/controllers/payment'`; Property 6 with `it.each` over the state table.
- `FlowHeader` test: Property 7.
- `src/infrastructure/i18n/__tests__/i18n.test.ts`: Property 8.
- Gate: `npx tsc --noEmit && npx vitest --run && npm run build && npm run check:bundle`; `npm run lint` (ESLint +
  Stylelint).
- Manual: `npm run dev` with `NEXT_PUBLIC_API_MOCK=true`, from `/order?event=evt_samudra` through the hold to
  `/payment?booking=bk_mock_1`, at 390×844 and 1440×900, ID and EN, against the HiFi payment screen (and the Figma
  nodes): `ok` (verifying → e-ticket), `?mock=snap_closed`, `?mock=payment_pending`, `?mock=payment_denied` ("Bayar lagi"
  → paid), `?mock=snap_busy` ("Coba lagi" → paid), `?mock=payment_late` (refund note), `?mock=offline` (load error),
  `/payment` without `booking` (not found). With the Midtrans sandbox (mock off), check that snap.js appears in the DOM
  only after this page loads and never on `/` or `/queue`.
