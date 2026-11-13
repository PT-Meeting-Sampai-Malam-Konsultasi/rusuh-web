# Design Document

## Overview

Presentation changes on `/payment`, props-in / JSX-out:

1. **`PaymentExpired`** (new section, `src/presentation/pages/Payment/components/PaymentExpired/`): the HiFi expired
   section, in the main column (not a dialog: the whole page is in this state, there is nothing behind to protect).
2. **Page shell**: one line rendering it when `expired` is non-null.
3. **Copy**: nine new keys in ID and EN (spec 82 Data Models); `action_back_home` and `payment_inactive_refund` reused.

No route change (`src/app/payment/page.tsx`, `error.tsx` unchanged), no DI change, no shared component change (`Stamp`,
`Button` as they are), no new mock: `?mock=short_payment` (spec 80, 150 s) reaches expiry quickly and
`?mock=payment_late` gives `paid_after_expiry` / `refundRequired`.

**Why a new section instead of widening `PaymentMessage`.** The expired screen has a stamp, a display-XL title, a note
with a bold lead and a primary button that calls a handler; `PaymentMessage` is the quiet title / body / retry pattern
for three other states. Sharing would add four optional props and branches to a section that has none today.

**HiFi differences recorded here** (controller-side ones are in spec 82):

| Topic        | HiFi (`payment.html` 84–90, `flow.css`, `rusuh.css`)         | This spec                                                               |
| ------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Heading      | `h1.d-xl.exp-h`                                              | same, plus `tabIndex={-1}` and focus on mount                           |
| Note text    | "dikembalikan otomatis ke metode yang sama" + literal e-mail | "dana akan kami kembalikan" (H-4) + `customerEmail` / "email akun Anda" |
| "Antre lagi" | `<a class="btn" href="waiting-room.html">`, arrow read aloud | `Button` → `onQueueAgain`; arrow `aria-hidden`; hidden without event    |
| Aside        | always visible                                               | visible only with a seen order (spec 82)                                |

## Architecture

```
src/app/payment/page.tsx                                                     unchanged
src/presentation/pages/Payment/index.tsx                                     + expired → {expired && <PaymentExpired expired={expired} />}
src/presentation/pages/Payment/__tests__/index.test.tsx, fixtures.ts         + expired fixture and shell tests
src/presentation/pages/Payment/components/PaymentExpired/
  index.tsx                                                                  new
  payment-expired.module.css                                                 new
  __tests__/index.test.tsx                                                   new
src/presentation/pages/Payment/components/PaymentMessage/index.tsx           doc remark only
src/translation/locale/id.json, en.json                                      + nine payment_expired_* keys
src/infrastructure/i18n/__tests__/i18n.test.ts                               + keys in the payment copy table, plural test
```

Data flow: spec 81 outcome → spec 82 `expired` → shell → `PaymentExpired`. "Antre lagi" → `expired.onQueueAgain()`
(spec 82: forget the turn, `queue_rejoin`, `router.replace('/queue?event=…')`). "Ke beranda" → `/`. No API call here.

## Components and Interfaces

```tsx
// src/presentation/pages/Payment/components/PaymentExpired/index.tsx
'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

import type { PaymentExpiredView } from '@controllers/payment.controller';
import Button from '@presentation/components/Button';
import Stamp from '@presentation/components/Stamp';

import styles from './payment-expired.module.css';

interface PaymentExpiredProps {
  expired: PaymentExpiredView;
}

/** "Pesanan dibatalkan." (FR-23-W1): the 10 minutes to pay ran out; queue again at the back or go home. */
export default function PaymentExpired({ expired }: PaymentExpiredProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <section className={styles.expired} aria-labelledby="payment-expired-title">
      <Stamp tone="sold">{expired.stamp}</Stamp>
      <h1 id="payment-expired-title" ref={titleRef} tabIndex={-1} className={styles.title}>
        {expired.title}
      </h1>
      <p className={styles.body}>{expired.body}</p>
      <p className={styles.note}>
        {expired.noteLead && <b className={styles.noteLead}>{expired.noteLead}</b>}
        {expired.noteLead && ' '}
        {expired.note}
      </p>
      <div className={styles.actions}>
        {expired.onQueueAgain && (
          <Button onClick={expired.onQueueAgain}>
            {expired.queueAgainLabel} <span aria-hidden="true">→</span>
          </Button>
        )}
        <Link className={styles.link} href={expired.homeHref}>
          {expired.homeLabel}
        </Link>
      </div>
    </section>
  );
}
```

```tsx
// src/presentation/pages/Payment/index.tsx (changes only)
import PaymentExpired from './components/PaymentExpired';

const { /* …existing fields… */ expired } = container.resolve<PaymentControllerInterface>('paymentController');

<div className={styles.flowMain}>
  {/* …existing… */}
  {message && <PaymentMessage message={message} />}
  {expired && <PaymentExpired expired={expired} />}
</div>;
```

- The section mounts only in the expired state, so the mount effect is "on entering expired" (visual micro-state, as
  `OrderTimeUpSheet`'s focus). The `h1` takes focus without a visible ring under `:focus` (only `:focus-visible` would
  show one; programmatic focus after a pointer action does not).
- `expired && …` is prop passing; the shell gains no hook and no logic.

## Data Models

Props: `PaymentExpiredView` (spec 82): `stamp`, `title`, `body`, `noteLead: string | null`, `note`, `queueAgainLabel`,
`onQueueAgain: (() => void) | null`, `homeHref`, `homeLabel`.

Translation keys: exactly the nine `payment_expired_*` rows of spec 82's Data Models table, in that order, inserted
after `payment_inactive_refund` in both files and in the `copy` object of the payment i18n test (which asserts the
`payment_*` key order). i18next plural suffixes: ID has the same sentence in `_one` and `_other` (the file's existing
convention, e.g. `order_summary_tickets_one` / `_other`). `{{email}}` is interpolated by i18next; React escapes it.

HiFi values → `payment-expired.module.css`:

| HiFi                                                                                       | Module                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `.mid.left` (flow.css 133–134, 165): column, gap 18px, max 640px, left, pt 20px (24 phone) | `.expired`: `flex max-w-[640px] flex-col items-start gap-[18px] pt-6`, md `pt-5` (as `PaymentMessage`)                        |
| `.d-xl` (rusuh.css 36): 800, `clamp(64px,9vw,128px)/.84`, stretch 75%, `-.02em`            | `.title`: `font-display font-extrabold leading-[0.84]`, `font-stretch: 75%`, `letter-spacing: -0.02em`                        |
| `.exp-h` (flow.css 137, 168): margin-top 6px; phone 58px                                   | `.title`: `mt-1.5 text-[58px]`; md `font-size: clamp(64px, 9vw, 128px)`; `outline: none` on `:focus` without `:focus-visible` |
| `.mid-p` (135, 167): 18px / 1.55; phone 16px                                               | `.body`: `text-base leading-[1.55]`, md `text-lg`                                                                             |
| `.note` (138): 2.5px ink, card, 16px 18px, 15px / 1.5, max 600px                           | `.note`: `PaymentMessage`'s `.note`; `.noteLead`: `font-bold`                                                                 |
| `.turn-act` (139): flex, center, gap 24px, mt 10px, wrap                                   | `.actions`: `mt-2.5 flex flex-wrap items-center gap-6`                                                                        |
| `.link` (rusuh.css 78)                                                                     | `.link`: `PaymentMessage`'s `.link` (44px target, hover, focus, pressed)                                                      |
| `.stamp.sold` (85)                                                                         | shared `Stamp tone="sold"`                                                                                                    |

Design-system rules: the stamp and the display title are the one loud thing in this state (timer and pay are gone);
the note is a trust zone (quiet, no tilt); pink = you (the button's offset), ink = actions.

## Layer Constraints

From `.claude/rules/presentation.md`:

- `'use client'` at the top.
- Zero hooks and zero logic of their own: `container.resolve<Interface>('xController')` at the top of render, then pass
  props to sections.
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

From `.claude/rules/design-system.md`:

- One loud thing per screen (Home: poster · Waiting room: your number · Detail: picks + timer · Payment: timer + pay ·
  E-ticket: "Sampai jumpa").
- Colour has a job: **pink = you**, **blue = the event**, **ink = actions**. Never swap.
- Print effects (misregistration, halftone, tilt, stamps) only on hero elements.
- Trust zones (NIK, payment, summary) are quiet: no tilt, no halftone behind text.
- **Stamp:** rotated −2°, caps, word first; one style per status (fill, outline, dashed, dark, grey).
- **Button:** ink plate + pink offset; press sinks into the shadow (90ms in, 150ms out); min height 56 web / 54 phone.
- Short, warm, "Anda". ID first, full EN translation.

From `.claude/rules/scaffold.md`:

- Resources: `src/translation/locale/id.json` and `en.json`, same keys in both, flat `snake_case`, single namespace.
- Copy comes from the HiFi / Design Brief voice rules; write ID first, then a full EN translation.

From `.claude/rules/performance.md`:

- Don't let first-load JS grow by more than 5 KB per PR without a reason in the PR.

Notes: the section takes strings, not `t` (as `PaymentMessage`). The heading focus is visual micro-state. The section
imports a type from `@controllers/payment.controller`, as the other Payment sections do.

## Correctness Properties

- Property 1: rendering `PaymentExpired` with keys as texts gives a `region` named `payment_expired_title` containing
  the stamp text, an `h1` with the title, the body, the note with `<b>payment_expired_note_lead</b>` then the note
  text. **Validates: Requirements 1**
- Property 2: after render the `h1` has focus (`toHaveFocus`). **Validates: Requirements 1**
- Property 3: `noteLead: null` renders no `b` and the note text alone. **Validates: Requirements 1**
- Property 4: the button is named exactly `payment_expired_queue_again` (arrow `aria-hidden`); a click calls
  `onQueueAgain` once; with `onQueueAgain: null` there is no `button` and the link `action_back_home` (`href="/"`) is
  still there. **Validates: Requirements 2**
- Property 5: the Payment screen with `state: 'expired'`, `expired` set, `summary: null`, `pay: null`, `timer: null`
  renders the section, no `timer` role, no pay button, no dock region; with `summary` set it also renders the aside
  without a pay button; with `expired: null` (every existing test) no `payment-expired-title` heading.
  **Validates: Requirements 3**
- Property 6: `payment-expired.module.css` starts with `@reference "../../../../../styles/app.css";`, has `text-[58px]`
  then `clamp(64px, 9vw, 128px)` under `@variant md`, `leading-[0.84]`, `font-stretch: 75%`, `gap-6`, the link's
  `min-h-11` and `:focus-visible`, no hex colour. **Validates: Requirements 4**
- Property 7: `id.json` / `en.json` have the nine keys with the spec 82 values, in the same order after
  `payment_inactive_refund`; `i18n.t('payment_expired_body', { count: 1 })` in EN is "…released the held ticket…", with
  `{ count: 3 }` "…the 3 held tickets…", in ID "…3 tiket yang ditahan…"; no `payment_*` value matches `/otomatis|automatic/i`
  or `/@/`. **Validates: Requirements 5**
- Property 8: rendered with the real strings, the heading reads "Pesanan dibatalkan." / "Order cancelled." and the
  button "Antre lagi" / "Queue again". **Validates: Requirements 5, 6**

## Error Handling

No API call in this layer; the section follows `expired` (spec 82):

| Situation (spec 82)                                     | Screen                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| countdown zero → refetch → expired                      | timer gone, section with focus on the title, aside kept                      |
| first load already expired                              | section, no aside                                                            |
| late payment (`refund`)                                 | section, definite refund note                                                |
| `getBooking` failed                                     | section without "Antre lagi", count from the order or none                   |
| `reason: 'other'` (CANCELLED)                           | existing `PaymentMessage` (no section)                                       |
| refetch at zero fails (5xx, `NETWORK_ERROR`, `TIMEOUT`) | existing error message + "Coba lagi" (no section)                            |
| 401                                                     | sign-in redirect (loading skeleton meanwhile)                                |
| render crash                                            | `src/app/payment/error.tsx` (unchanged: "Tiket Anda tetap ditahan" fallback) |

States covered on `/payment`: loading, ready, opening, verifying, failed, busy, leaving, inactive, not-found, error
(unchanged) and expired (new). Both languages.

## Testing Strategy

- `src/presentation/pages/Payment/components/PaymentExpired/__tests__/index.test.tsx`: Properties 1–4 with
  `render`, `screen`, `userEvent`; Property 6 reads the CSS module as text (the `OrderTimeUpSheet` pattern); Property 8
  with `@/translation/locale/id.json` / `en.json` values.
- `src/presentation/pages/Payment/__tests__/fixtures.ts`: `expiredView(overrides)`;
  `__tests__/index.test.tsx`: Property 5 and the state table row for `expired`.
- `src/infrastructure/i18n/__tests__/i18n.test.ts`: the nine keys in the payment `copy` object (order matters), the
  plural test and the no-"otomatis" / no-`@` checks (Property 7).
- Gate: `npx tsc --noEmit && npx vitest --run && npm run build` (`out/payment.html` keeps scoped class names); manual:
  - `/order?event=evt_samudra&mock=short_payment` → hold → pay page; wait for zero at 390 and 1440, ID and EN: the timer
    disappears, the stamp reads "WAKTU HABIS" / "TIME'S UP", "Pesanan dibatalkan.", "3 tiket…", the note with the
    mock's account e-mail, the aside without "Bayar", no dock on 390;
  - reload the same URL: the section without the aside, note with "email akun Anda";
  - `?mock=payment_late`: the definite refund note;
  - "Antre lagi" → `/queue?event=evt_samudra` with a new number, Back does not reopen the dead payment page;
    "Ke beranda" → Home.
