# Design Document

## Overview

Presentation changes on `/order`, props-in / JSX-out:

1. **`OrderTimeUpSheet`** (new section, `src/presentation/pages/Order/components/OrderTimeUpSheet/`): scrim + sheet
   with the HiFi time's-up content, modelled on `QueueLeaveSheet` (spec 57): `role="dialog"`, `aria-modal`, labelled by
   the title, described by the body, focus on the primary action at mount. Not dismissible.
2. **Page shell**: one line that renders the section when `orderController.timeUpSheet` is non-null.
3. **Copy**: four new keys in ID and EN; the home link reuses `action_back_home`.

No route change (`src/app/order/page.tsx` unchanged), no DI change, no shared component change (`Stamp`, `Button` are
used as they are), no new mock: spec 60's `short_window` (75 s) reaches zero quickly.

**Why a page section and not a shared dialog.** `QueueLeaveSheet` and this sheet share the scrim / sheet CSS, but differ
in behaviour (that one closes with Escape and has two buttons; this one is not dismissible and has a link), and a shared
`Dialog` would also need the focus trap both lack. Two copies of ~20 lines of CSS are cheaper than a premature
abstraction; a shared dialog with a real focus trap is the known follow-up for both.

**Not dismissible.** The order no longer exists on the server (the admission was released) and spec 61 already forgot
the place on this device, so closing the sheet would leave an editable page that can do nothing. The buyer leaves by
"Antre lagi" (the expected path, primary and focused) or "Ke beranda". No Escape handler, no scrim `onClick`, no close
button. `aria-modal="true"` tells assistive technology the page behind is not available.

**Known follow-up (not this ticket), shared with `QueueLeaveSheet`.** Focus is moved into the sheet but not trapped:
Tab can leave it and reach the page behind (the language switch, the steppers, the NIK fields). Spec 62 makes that
harmless (categories query disabled, redirect guard), but the page behind should become `inert` with a proper trap. No
scroll lock either (the page can scroll under the fixed scrim, as on the queue page).

**HiFi differences recorded here:**

| Topic          | HiFi (`detail.html` 63–70, `rusuh.css`)                           | This spec                                                                       |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Trigger        | `data-onzero="expired"` from a device-clock `data-countdown`      | `timeUpSheet` from the server-time countdown (spec 59 / 62, ADR-0005)           |
| Dialog element | `role="dialog"` on the scrim                                      | on the sheet, as `QueueLeaveSheet`; the scrim is presentational                 |
| Description    | none                                                              | `aria-describedby` on the body                                                  |
| Arrow          | `<span class="arr">→</span>`, read aloud                          | `aria-hidden="true"`: the button's name is "Antre lagi"                         |
| "Antre lagi"   | `<a class="btn" href="waiting-room.html">`                        | `Button` calling `queueAgain` (tracks, then `router.replace('/queue?event=…')`) |
| "Ke beranda"   | `<a class="link" href="home.html">`                               | `next/link` to `homeHref` (`/`)                                                 |
| Focus          | none                                                              | primary button focused at mount                                                 |
| Inline styles  | `margin-top:16px`, `12px`, flex row `gap:20px`, `margin-top:24px` | the same values in the CSS module                                               |

## Architecture

```
src/app/order/page.tsx                                                     unchanged
src/presentation/pages/Order/index.tsx                                     + {timeUpSheet && <OrderTimeUpSheet sheet={timeUpSheet} />}
src/presentation/pages/Order/__tests__/index.test.tsx                      + sheet shown / absent, page under it
src/presentation/pages/Order/components/OrderTimeUpSheet/
  index.tsx                                                                new
  order-time-up-sheet.module.css                                           new
  __tests__/index.test.tsx                                                 new
src/presentation/components/Stamp/, Button/                                unchanged
src/presentation/pages/Queue/components/QueueLeaveSheet/                   unchanged
src/translation/locale/id.json, en.json                                    + order_time_up_stamp / _title / _body / _queue_again
src/infrastructure/i18n/__tests__/i18n.test.ts                             + the four values in both locales
```

Route: `/order?event=<id>`. Data flow: spec 59 countdown → spec 62 `expired` latch → `timeUpSheet` → shell →
`OrderTimeUpSheet`. "Antre lagi" → `sheet.queueAgain()` (spec 62: `queue_rejoin`, `router.replace('/queue?event=<id>')`)
→ the waiting room joins at the back (spec 61 forgot the place). "Ke beranda" → `/`. No API call in this layer.

## Components and Interfaces

```tsx
// src/presentation/pages/Order/components/OrderTimeUpSheet/index.tsx
'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

import type { OrderTimeUpView } from '@controllers/order.controller';
import Button from '@presentation/components/Button';
import Stamp from '@presentation/components/Stamp';

import styles from './order-time-up-sheet.module.css';

interface OrderTimeUpSheetProps {
  sheet: OrderTimeUpView;
}

/**
 * "5 menit sudah lewat." (FR-18-W1): the order window ended, the place went to the next number. Not dismissible: the
 * only ways out are "Antre lagi" (primary, focused) and "Ke beranda". A dialog on desktop, a bottom sheet on phones.
 */
export default function OrderTimeUpSheet({ sheet }: OrderTimeUpSheetProps) {
  const queueAgainRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    queueAgainRef.current?.focus();
  }, []);

  return (
    <div className={styles.scrim}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-time-up-title"
        aria-describedby="order-time-up-body"
      >
        <Stamp tone="sold">{sheet.stamp}</Stamp>
        <h2 id="order-time-up-title" className={styles.title}>
          {sheet.title}
        </h2>
        <p id="order-time-up-body" className={styles.body}>
          {sheet.body}
        </p>
        <div className={styles.actions}>
          <Button ref={queueAgainRef} onClick={sheet.queueAgain}>
            {sheet.queueAgainLabel} <span aria-hidden="true">→</span>
          </Button>
          <Link className={styles.link} href={sheet.homeHref}>
            {sheet.homeLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- The section is mounted only while the sheet is shown (the shell's `timeUpSheet &&`), so the mount effect is "on open";
  unlike `QueueLeaveSheet` it needs no `open` flag. The ref + effect is visual micro-state (focus), allowed in a section.
- `Button` already takes `ref` (React 19 prop) and is `type="button"`. The arrow sits inside the button, after a space,
  as on the Tickets page (`{label} <span aria-hidden="true">→</span>`).
- The link is a plain `next/link` like `OrderMessage`'s home link; `/` is a static page, so the default prefetch is fine.
- Ids are fixed strings: one sheet per page.

```tsx
// src/presentation/pages/Order/index.tsx (changes only)
import OrderTimeUpSheet from './components/OrderTimeUpSheet';

const { /* …existing fields… */ timeUpSheet } = container.resolve<OrderControllerInterface>('orderController');

      </main>
      {timeUpSheet && <OrderTimeUpSheet sheet={timeUpSheet} />}
    </div>
```

`timeUpSheet && …` is prop passing (as `timer && <Timer … />` and the `status === … &&` lines); the shell gains no hook
and no logic. The page under the sheet is unchanged, so the timer keeps showing "0:00" in the warning style.

## Data Models

Props: `OrderTimeUpView` (spec 62), all strings already translated:

```ts
{ stamp: string; title: string; body: string; queueAgainLabel: string; homeLabel: string; homeHref: string;
  queueAgain: () => void }
```

Translation keys (written here; spec 62 reads them):

| Key                         | ID                                                                                                           | EN                                                                                             | Source                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------- |
| `order_time_up_stamp`       | Waktu habis                                                                                                  | Time's up                                                                                      | HiFi `detail.html:65` |
| `order_time_up_title`       | 5 menit sudah lewat.                                                                                         | Your 5 minutes are up.                                                                         | HiFi `detail.html:66` |
| `order_time_up_body`        | Pilihan Anda belum disimpan dan tempat Anda kami berikan ke nomor berikutnya. Antre lagi untuk mencoba lagi. | Your picks weren't saved and your place went to the next number. Queue again to try once more. | HiFi `detail.html:67` |
| `order_time_up_queue_again` | Antre lagi                                                                                                   | Queue again                                                                                    | HiFi `detail.html:68` |
| `action_back_home` (exists) | Ke beranda                                                                                                   | Go home                                                                                        | HiFi `detail.html:68` |

Place the new keys after `order_timer_label` in both files (readers only; the parity test sorts keys). The stamp is
written in sentence case: `Stamp` sets `text-transform: uppercase`, so the screen shows "WAKTU HABIS" while a screen
reader gets the words. The arrow is not in the translation (it is decoration, `aria-hidden`).

HiFi values → `order-time-up-sheet.module.css`:

| HiFi (`rusuh.css`)                                                                                | Module                                                                                     |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `.scrim` fixed, inset 0, `rgba(20,20,20,.55)`, grid centre, z 50, padding 16px (153)              | `.scrim` md: `place-items-center p-4`; colour `bg-ink/55`; `z-[90]` (app stack)            |
| phone `.scrim{place-items:end stretch;padding:0}` (199)                                           | `.scrim` base: `place-items-end p-0`                                                       |
| `.sheet` paper, 2.5px ink border, `6px 6px 0 pink`, max 520px, width 100%, padding 32px (154)     | `.sheet` md: `max-w-[520px] border-[2.5px] p-8`, `box-shadow: 6px 6px 0 var(--color-pink)` |
| phone `.sheet` fixed bottom, full width, no shadow, top border only, padding 26px 20px 30px (198) | `.sheet` base: `w-full border-t-[2.5px] border-ink bg-paper px-5 pt-[26px] pb-[30px]`      |
| `.stamp`, `.stamp.sold` (81, 85)                                                                  | shared `Stamp tone="sold"`, unchanged                                                      |
| `.d-l` 800, `clamp(40px,5vw,64px)/.92`, stretch 75%, `-.01em` (37); `margin-top:16px`             | `.title`: `mt-4`, as `OrderMessage`'s `.title`                                             |
| `<p style="margin-top:12px">`                                                                     | `.body`: `mt-3`, Body role (15px phone, 16px from md)                                      |
| actions `display:flex;gap:20px;align-items:center;margin-top:24px;flex-wrap:wrap`                 | `.actions`: `mt-6 flex flex-wrap items-center gap-5`                                       |
| `.link` 600 15px, underline, offset 4px, thickness 2px (78)                                       | `.link`: `OrderMessage`'s `.link` (adds 44px target, hover, focus, pressed)                |

Styles (the values are fixed; the writer may adjust syntax to what Stylelint accepts):

```css
@reference "../../../../../styles/app.css";

/* HiFi .scrim / .sheet (rusuh.css 153–154, 198–199): a bottom sheet on phones, a dialog from 720px.
   Same stack as QueueLeaveSheet: under the error popup (95) and the offline banner (96). */
.scrim {
  @apply fixed inset-0 z-[90] grid place-items-end bg-ink/55 p-0;

  @variant md {
    @apply place-items-center p-4;
  }
}

.sheet {
  @apply w-full border-t-[2.5px] border-ink bg-paper px-5 pt-[26px] pb-[30px];

  @variant md {
    @apply max-w-[520px] border-[2.5px] p-8;
    box-shadow: 6px 6px 0 var(--color-pink);
  }
}

/* HiFi .d-l */
.title {
  @apply mt-4 font-display text-[40px] leading-[0.92] font-extrabold;
  font-stretch: 75%;
  letter-spacing: -0.01em;
  text-wrap: balance;

  @variant md {
    font-size: clamp(40px, 5vw, 64px);
  }
}

.body {
  @apply mt-3 text-[15px] leading-normal;

  @variant md {
    @apply text-base;
  }
}

.actions {
  @apply mt-6 flex flex-wrap items-center gap-5;
}

/* HiFi .link, as OrderMessage */
.link {
  @apply inline-flex min-h-11 items-center font-semibold text-ink underline decoration-2 underline-offset-4;

  &:hover {
    @apply text-pink-ink;
  }

  &:focus-visible {
    @apply outline-3 outline-offset-3 outline-blue;
  }

  &:active {
    transform: translateY(1px);
  }
}
```

- The 6px pink offset has no token (`--shadow-off` is 6px ink, `--shadow-off-pink` 4px), so it is raw CSS from
  `--color-pink`, exactly as `QueueLeaveSheet`. No hex in the module.
- `bg-ink/55` is the HiFi `rgba(20,20,20,.55)` (`--color-ink` is `#141414`).
- Phone: the sheet sits at the bottom of the grid (`place-items-end`) at full width. At 390px the content is ≈ 350px wide:
  the title wraps to two lines at 40px, the button and the link fit on one row or wrap under each other.
- The `:active` 1px shift on the link is a transform on press, not an animation; nothing to switch off for
  `prefers-reduced-motion`. `Button` brings its own pressed state.
- Design-system rules: the stamp is the sheet's one print effect (the sheet is the hero while it is open); pink = you
  (the offset of your sheet), ink = actions (the button). Short, warm, "Anda".

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

Notes: whether the sheet shows is business state and lives in the controller (`timeUpSheet`, spec 62); the section only
moves focus (visual micro-state). `timeUpSheet && …` in the shell is prop passing (the add-page reference: "Showing one
section per state … is prop passing, not logic"). The section imports a type from `@controllers/order.controller`, as
`QueueLeaveSheet` does from the queue controller. The section gets strings, not `t` (the "including `t`" line allows
`t`; strings keep it simpler, as `OrderMessage`). The link has no `:disabled` state (a link cannot be disabled).

From `.claude/rules/design-system.md`:

- One loud thing per screen (Home: poster · Waiting room: your number · Detail: picks + timer · Payment: timer + pay ·
  E-ticket: "Sampai jumpa").
- Colour has a job: **pink = you**, **blue = the event**, **ink = actions**. Never swap.
- Print effects (misregistration, halftone, tilt, stamps) only on hero elements.
- Port values exactly; don't approximate with Tailwind's default palette.
- Border width 2.5px ink; offsets 6px (cards, posters) and 4px (buttons, focus), 0 blur, in ink, pink or blue.
- **Stamp:** rotated −2°, caps, word first; one style per status (fill, outline, dashed, dark, grey).
- **Button:** ink plate + pink offset; press sinks into the shadow (90ms in, 150ms out); min height 56 web / 54 phone.
- Short, warm, "Anda". ID first, full EN translation.

From `.claude/rules/scaffold.md`:

- Resources: `src/translation/locale/id.json` and `en.json`, same keys in both, flat `snake_case`, single namespace.
- Copy comes from the HiFi / Design Brief voice rules; write ID first, then a full EN translation.

From `.claude/rules/performance.md`:

- Don't let first-load JS grow by more than 5 KB per PR without a reason in the PR.

## Correctness Properties

- Property 1: rendering `OrderTimeUpSheet` with keys as texts gives one `getByRole('dialog', { name:
'order_time_up_title' })` with `aria-modal="true"` and accessible description `order_time_up_body`; it contains the
  text `order_time_up_stamp` and an `h2` (`getByRole('heading', { level: 2 })`) with the title.
  **Validates: Requirements 1, 2**
- Property 2: after render, `document.activeElement` is the button named exactly `order_time_up_queue_again` (the arrow
  is excluded from the name); the arrow `→` is in the DOM inside an `aria-hidden="true"` span.
  **Validates: Requirements 1, 2**
- Property 3: clicking that button (`userEvent`) calls `queueAgain` once; the link named `action_back_home` has
  `href="/"`. **Validates: Requirements 1**
- Property 4: pressing Escape (`userEvent.keyboard('{Escape}')`) and clicking the scrim (the dialog's parent element) call
  nothing and leave the dialog in the document; the dialog contains exactly one `button`.
  **Validates: Requirements 3**
- Property 5: rendered with the real `id.json` / `en.json` strings, the dialog is named "5 menit sudah lewat." / "Your 5
  minutes are up." and the button "Antre lagi" / "Queue again". **Validates: Requirements 6**
- Property 6: `order-time-up-sheet.module.css` starts with `@reference "../../../../../styles/app.css";`; outside
  `@variant md` the sheet has `border-t-[2.5px]`, `px-5 pt-[26px] pb-[30px]` and no `box-shadow`; inside it
  `max-w-[520px]`, `border-[2.5px]`, `p-8` and `6px 6px 0 var(--color-pink)`; the scrim has `place-items-end p-0` then
  `place-items-center p-4`; the link has `min-h-11` and `:focus-visible`; no hex colour, no `transition`, no
  `animation`. **Validates: Requirements 2, 4**
- Property 7: the Order screen with `timeUpSheet: null` renders no `dialog`; with a view it renders the dialog and still
  renders the categories list, the `banner` and (with `timer: { seconds: 0, label }`) the two timers reading "0:00".
  **Validates: Requirements 5**
- Property 8: `id.json` and `en.json` have the four new keys with the values of the Data Models table, the same key set,
  and `action_back_home` unchanged. **Validates: Requirements 6**
- Property 9: `Stamp`, `Button`, `QueueLeaveSheet` and `src/app/order/page.tsx` have no diff; `out/order.html` keeps
  scoped class names after `npm run build`. **Validates: Requirements 4, 7**

## Error Handling

No API call in this layer. The sheet follows `timeUpSheet` (spec 62), whose latch keeps it up whatever happens to the
page behind:

| Situation (spec 62)                                    | Behind the sheet                         | Sheet                     |
| ------------------------------------------------------ | ---------------------------------------- | ------------------------- |
| counting (`timeUpSheet` null)                          | page as today                            | not rendered              |
| zero reached / answer already expired                  | page, timer "0:00" pink                  | shown, focus on primary   |
| language switched (keyboard, no trap)                  | texts switch, no refetch                 | texts switch              |
| `getEvent` refetch fails (`status` `'error'`)          | error view ("Coba lagi" under the scrim) | stays                     |
| NIK check answers `ADMISSION_INVALID`                  | no redirect                              | stays                     |
| offline (`NETWORK_ERROR` banner, z 96 above the scrim) | offline banner visible                   | stays; actions still work |
| error popup from elsewhere (z 95)                      | popup above the sheet                    | stays under it            |

Before expiry every `getCategories` / `getEvent` outcome (`ADMISSION_INVALID` redirect, `UNAUTHORIZED`,
`INTERNAL_ERROR`, `NETWORK_ERROR`, `TIMEOUT`, `NOT_FOUND`) renders as in specs 59 and 60, with no sheet. The segment
fallback `src/app/order/error.tsx` is unchanged and has no sheet.

States covered: loading, error, not-found, ready (no sheet); ready at zero (sheet); expired on arrival (sheet at once);
offline at zero (sheet, offline banner above). Both languages.

## Testing Strategy

- `src/presentation/pages/Order/components/OrderTimeUpSheet/__tests__/index.test.tsx`:
  - `const sheet = { stamp: 'order_time_up_stamp', title: 'order_time_up_title', body: 'order_time_up_body',
queueAgainLabel: 'order_time_up_queue_again', homeLabel: 'action_back_home', homeHref: '/', queueAgain: vi.fn() }`;
  - Properties 1–4 with `render`, `screen`, `userEvent`, `toHaveAccessibleName` / `toHaveAccessibleDescription`,
    `toHaveFocus`;
  - Property 5 with the values read from `@/translation/locale/id.json` and `en.json`;
  - Property 6: the CSS module read as text (the `HolderList` / `Timer` test pattern).
- `src/presentation/pages/Order/__tests__/index.test.tsx` (`base()` has `timeUpSheet: null` since spec 62 task 4):
  - the existing tests: no `dialog`;
  - new: `timeUpSheet` set → one dialog, categories list and `banner` still present; with `timer: { seconds: 0, label:
'order_timer_label' }` two timers read "0:00" (Property 7).
- `src/infrastructure/i18n/__tests__/i18n.test.ts`: a new `it('has the time's-up sheet copy in both locales
(FR-18-W1)')` with the four values per locale (Property 8).
- Gate: `npx tsc --noEmit && npx vitest --run && npm run build`; then the manual check with the mock API:
  - `/order?event=evt_samudra&mock=short_window` at 390 and 1440, ID and EN: "1:15" → pink from "1:00" → "0:00" and the
    sheet appears; focus ring on "Antre lagi"; Escape and a click on the scrim do nothing; at 1440 a centred 520px
    dialog with the pink offset; at 390 a bottom sheet, full width, top border only, no shadow; the stamp reads
    "WAKTU HABIS" / "TIME'S UP"; the title wraps cleanly;
  - in DevTools after zero: `localStorage` has no `rusuh.queue.evt_samudra` (spec 61);
  - "Antre lagi" → `/queue?event=evt_samudra` with a new number (no "missed" screen); Back does not return to the dead
    order page;
  - "Ke beranda" → Home;
  - Tab from the sheet reaches the page behind (known follow-up; no navigation happens from a NIK blur there);
  - `?mock=ok`: no sheet during the 5 minutes; `?mock=slow` / `?mock=error`: no sheet.
  - Mock caveat (spec 60): each `getCategories` request gets a fresh window in the mock; after expiry the query is
    disabled, so a language switch under the sheet does not restart anything.
