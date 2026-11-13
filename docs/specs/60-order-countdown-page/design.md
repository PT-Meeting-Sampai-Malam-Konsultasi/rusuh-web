# Design Document

## Overview

Presentation changes on `/order`, props-in / JSX-out:

1. **`Timer`** (existing shared component, `src/presentation/components/Timer/`): one new optional prop `compact`. With
   it, below 720px the timer takes the HiFi app-bar form (22px value, 3px offset, tighter padding, label visually
   removed); from 720px it is the normal form. Without it nothing changes.
2. **Page shell**: one new prop on `FlowHeader` (`timer`), fed from `orderController.timer` through `Timer`.
3. **Copy**: `order_timer_label` in ID and EN.
4. **Mock**: a `short_window` scenario (75-second order window) for the manual check of the warning and zero states.

No new component, no route change (`src/app/order/page.tsx` already wraps the screen in `<Suspense>`), no DI change, no
`FlowHeader` change (its `timer?: ReactNode` slot and `.timer` wrapper already render the node in both bars). `timeUp` is
not read by the shell (FR-18-W1).

**Reuse of `Timer`.** `Timer` already ports the HiFi `.timer` (34px stamp, label, pink warning) and its own prop comment
names this use ("60 on the order page, 120 on payment"). It takes `seconds`, formats `m:ss` itself (`formatSeconds`) and
decides the warning (`seconds <= warnAt`, default 60). The Order page uses it as is, with the default `warnAt`: pink from
"1:00", which matches the design-system rule ("pink at 60 s (Detail)") and the HiFi (`left <= 60`). The only thing
missing is the phone app-bar form, hence `compact`. `QueueTurn` does not pass `compact` and is untouched in markup and
appearance.

**Warning and "status never by colour alone".** The rule asks for "word + style". The timer's status is the remaining
time, and that is always text ("0:42"); the pink shadow and pink-ink digits only add emphasis in the last minute, so no
information is carried by colour alone. No extra word or icon is added (the HiFi has none). The moment that needs words,
time running out, gets them in FR-18-W1. `pink-ink` (`#b8125c`) on `card` (`#fbf9f3`) keeps the digits above 4.5:1.

**Known follow-up (not this ticket).** `Timer` sets `aria-live="polite"` while warning and has no accessible name; both
are shared with the queue page and are left as they are.

**HiFi differences recorded here:**

| Topic          | HiFi                                                 | This spec                                                                |
| -------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Source of time | `data-countdown="252"` counted with the device clock | controller seconds from `expiresAt − serverNow` + elapsed (ADR-0005)     |
| `role="timer"` | desktop timer only; the app bar timer has no role    | both instances are `Timer` (role on both); `display: none` hides one     |
| Phone timer    | separate markup without the label element            | same component; the label stays in the DOM, visually removed below 720px |
| At zero        | `data-onzero="expired"` opens the expired state      | stays "0:00" in the warning style; the sheet is FR-18-W1                 |

## Architecture

```
src/app/order/page.tsx                                   unchanged
src/presentation/pages/Order/index.tsx                   + timer from the controller → <Timer … compact /> → FlowHeader
src/presentation/pages/Order/__tests__/index.test.tsx    + timer shown in both bars / warning / absent when null
src/presentation/components/Timer/
  index.tsx                                              + compact?: boolean → data-compact
  timer.module.css                                       + [data-compact] rules (compact base, normal from md)
  __tests__/index.test.tsx                               + compact cases, CSS checks; existing tests unchanged
src/presentation/components/FlowHeader/                  unchanged (slot + .timer wrapper already there)
src/presentation/pages/Queue/components/QueueTurn/       unchanged (no compact)
src/translation/locale/id.json, en.json                  + order_timer_label
src/infrastructure/i18n/__tests__/i18n.test.ts           + order_timer_label in both locales
src/infrastructure/mocks/scenario.ts                     + 'short_window'
src/infrastructure/mocks/handlers/booking.handlers.ts    + 75 s window under short_window
src/infrastructure/mocks/__tests__/scenario.test.ts, booking.handlers.test.ts   + short_window
```

Route: `/order?event=<id>`. Data flow: `getCategories` → `getOrderCategoriesUseCase` (spec 13) → `orderController.timer`
(`{ seconds, label }`, spec 59) → shell → `FlowHeader` `timer` slot → `Timer` (twice: flow bar and app bar). No API call
in this layer.

How the two instances are exposed (`flow-header.module.css`, unchanged): `.bar` is `@apply hidden` and becomes flex in
`@variant md` (720px); `.appBar` is a grid and becomes `@apply hidden` in `@variant md`. `display: none` removes a subtree
from rendering and from the accessibility tree, so at every width exactly one `role="timer"` is visible and announced.
`Timer`'s compact rules switch at the same breakpoint (`@variant md`), so the visible instance always has the right
form: compact in the app bar, normal in the flow bar. jsdom applies no CSS, so tests see both instances.

## Components and Interfaces

```tsx
// src/presentation/components/Timer/index.tsx (changes marked; formatSeconds unchanged)
interface TimerProps {
  /** Seconds left, computed by the controller from server time. */
  seconds: number;
  label?: string;
  /** Turns pink at or below this many seconds (60 on the order page, 120 on payment). */
  warnAt?: number;
  /** Phone app-bar form below 720px (22px value, 3px offset, label visually removed); normal from 720px. */
  compact?: boolean; // ← new
}

export default function Timer({ seconds, label, warnAt = 60, compact }: TimerProps) {
  const warn = seconds <= warnAt;
  return (
    <div
      className={`${styles.timer} ${warn ? styles.warn : ''}`}
      role="timer"
      aria-live={warn ? 'polite' : 'off'}
      data-compact={compact || undefined} // ← new
    >
      <span className={styles.time}>{formatSeconds(seconds)}</span>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
```

- `data-compact={compact || undefined}` writes `data-compact="true"` or no attribute, so the markup without `compact` is
  byte-for-byte today's. An attribute (not a class) is used so tests can assert it without depending on CSS Module class
  names; the CSS selects `.timer[data-compact]`.
- Everything else (`role`, `aria-live`, `warn` class, `formatSeconds`, optional label) is untouched.

```tsx
// src/presentation/pages/Order/index.tsx (changes only)
import Timer from '@presentation/components/Timer';

const { /* …existing fields… */ timer } = container.resolve<OrderControllerInterface>('orderController');

<FlowHeader
  /* …existing props unchanged… */
  timer={timer && <Timer seconds={timer.seconds} label={timer.label} compact />}
/>;
```

`timer && …` yields `null` when there is no timer; `FlowHeader` renders its wrapper only for a truthy node. This is
prop passing, like the shell's `status === … &&` lines; the shell gains no hook and no logic. `OrderTimerView`
(`{ seconds: number; label: string }`) matches `Timer`'s `seconds: number` and `label?: string`.

Mock (dev only):

```ts
// src/infrastructure/mocks/scenario.ts — new entry in MOCK_SCENARIOS, after 'dukcapil_down'
/** FR-17: the order window is 75 seconds, so the pink last minute and 0:00 show quickly. */
'short_window',

// src/infrastructure/mocks/handlers/booking.handlers.ts
const ORDER_WINDOW_MS = 5 * 60_000;
/** `?mock=short_window`: 15 s of the ink timer, pink from 1:00, then 0:00. */
export const MOCK_SHORT_ORDER_WINDOW_MS = 75_000;
// in the categories handler:
const windowMs = scenario === 'short_window' ? MOCK_SHORT_ORDER_WINDOW_MS : ORDER_WINDOW_MS;
expiresAt: new Date(today.getTime() + windowMs).toISOString(),
```

`MockScenario` is derived from the array, so `resolveScenario` accepts the new name with no other change. The queue
mock's `placementOf` only reacts to `ok` / `near_front` / `far_back` / `no_queue`, so `short_window` keeps a running
queue's placement.

## Data Models

Props come from `OrderTimerView` (spec 59): `{ seconds: number; label: string } | null`.

Translation key (written here):

| Key                 | ID                 | EN             | Source                |
| ------------------- | ------------------ | -------------- | --------------------- |
| `order_timer_label` | sisa waktu memilih | left to choose | HiFi `detail.html:13` |

Lower case in both languages, as in the HiFi (it follows the number: "4:12 sisa waktu memilih"). Place the key with the
other `order_*` header keys (after `order_back_label`) in both files; the parity test compares sorted keys, so the
position is for readers only.

HiFi values → `timer.module.css`:

| HiFi (`rusuh.css`)                                               | Module                                                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `.timer`, `.timer .t`, `.timer .l`, `.timer.warn` (137–141)      | existing `.timer`, `.time`, `.label`, `.warn`: unchanged                                       |
| `.appbar .timer` padding 5px 9px 4px; shadow 3px 3px 0 ink (184) | `.timer[data-compact]` base: `px-[9px] pt-[5px] pb-1`, `3px 3px 0 var(--color-ink)`            |
| `.appbar .timer.warn` shadow 3px 3px 0 pink (185)                | `.warn[data-compact]` base: `3px 3px 0 var(--color-pink)`                                      |
| `.appbar .timer .t` 22px (186)                                   | `.timer[data-compact] .time` base: `text-[22px]`                                               |
| `.appbar .timer .l` hidden (187)                                 | `.timer[data-compact] .label` base: `sr-only` (visually removed, still in the DOM)             |
| (from 720px the app bar is gone)                                 | inside `@variant md`: the normal values restated (34px, 8px 14px 7px, 4px offset, label shown) |

Styles (additions to `timer.module.css`, after the existing rules, which stay as they are; the values are fixed, the
writer may adjust syntax to what Stylelint accepts):

```css
/* FlowHeader app bar (HiFi .appbar .timer): compact below 720px, the normal stamp from 720px.
   Only with data-compact, so the queue turn timer is unchanged. 3px has no shadow token: built from the colours. */
.timer[data-compact] {
  @apply px-[9px] pt-[5px] pb-1;
  box-shadow: 3px 3px 0 var(--color-ink);

  .time {
    @apply text-[22px];
  }

  .label {
    @apply sr-only;
  }

  @variant md {
    @apply px-3.5 pt-2 pb-[7px];
    box-shadow: 4px 4px 0 var(--color-ink);

    .time {
      @apply text-[34px];
    }

    .label {
      @apply not-sr-only;
    }
  }
}

.warn[data-compact] {
  box-shadow: 3px 3px 0 var(--color-pink);

  @variant md {
    box-shadow: 4px 4px 0 var(--color-pink);
  }
}
```

- Mobile first inside the compact scope: the base is the phone form, `@variant md` restores the normal one. From 720px
  the result must be pixel-identical to a `Timer` without `compact` (`4px 4px 0 ink` is the value of `--shadow-off-s`,
  `4px 4px 0 pink` of `--shadow-off-pink`); the raw `box-shadow` is used on both sides of the breakpoint so the compact
  rule never fights the `shadow-off-*` utilities of the base classes.
- 3px has no shadow token (`--shadow-off-s` is 4px), so the compact shadow is raw CSS built from `--color-ink` /
  `--color-pink`. No hex colour in the module.
- "Visually removed" is `sr-only`, not `display: none`: the label stays in the DOM and, since `Timer` has no accessible
  name, stays available to a screen reader in the app bar. `.timer` is `inline-flex`; the `sr-only` label is taken out
  of the flow, so the `gap` adds no space next to the value.
- `.warn .time` (pink-ink) already applies in both forms; `.warn[data-compact]` must come after `.timer[data-compact]`
  so the pink plate wins.
- Tabular numerals are already on `.time`. No transition or animation is added, so nothing to switch off for
  `prefers-reduced-motion`. Not interactive: no hover, focus, pressed or disabled states.
- Heights: compact ≈ 36px in the 60px app bar; normal ≈ 54px in the 80px flow bar. `FlowHeader`'s `.timer` wrapper
  (`flex items-center`) centres it. The app bar grid is `1fr auto 1fr`; the compact stamp ("0:00" at 22px ≈ 64px wide)
  fits the right column next to the truncating title at 390px.
- Design-system rules: pink = you (your time), ink = the stamp; the header is not a trust zone, and the timer is one of
  the Detail page's loud things ("picks + timer"); no tilt or halftone is added.

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

Notes: `timer && <Timer … />` in the shell is prop passing (the add-page reference: "Showing one section per state … is
prop passing, not logic"). The shell's existing imports of `@infrastructure/di/container` and
`@infrastructure/di/controllers/order` are the sanctioned ones (scaffold rule) and do not change. `Timer`'s existing
named export `formatSeconds` stays (not introduced here).

From `.claude/rules/design-system.md`:

- One loud thing per screen (Home: poster · Waiting room: your number · Detail: picks + timer · Payment: timer + pay ·
  E-ticket: "Sampai jumpa").
- Colour has a job: **pink = you**, **blue = the event**, **ink = actions**. Never swap.
- Print effects (misregistration, halftone, tilt, stamps) only on hero elements.
- Say the real number ("± 4 menit"), never inflate.
- Port values exactly; don't approximate with Tailwind's default palette.
- Border width 2.5px ink; offsets 6px (cards, posters) and 4px (buttons, focus), 0 blur, in ink, pink or blue.
- Tabular figures for anything that changes (numbers, timers, money). Smallest text 12.5px.
- **Timer:** ink stamp; pink at 60 s (Detail) / 120 s (Payment).
- Short, warm, "Anda". ID first, full EN translation. Formats: `1.248`, `Rp 2.180.000`, `19.00 WIB`, `Sab, 12 Des 2026`
  (EN `1,248`, `Rp 2,180,000`, `7.00 pm WIB`, `Sat, 12 Dec 2026`). NIK masked as first 4 + last 4.

Note: the 3px offset of the compact form is the HiFi's own value for the app bar (`rusuh.css:184`), ported exactly; the
rule's 4px applies from 720px.

From `.claude/rules/scaffold.md`:

- Resources: `src/translation/locale/id.json` and `en.json`, same keys in both, flat `snake_case`, single namespace.
- Copy comes from the HiFi / Design Brief voice rules; write ID first, then a full EN translation.

From `.claude/rules/performance.md`:

- Don't let first-load JS grow by more than 5 KB per PR without a reason in the PR.

From `CLAUDE.md`:

- Countdowns use server time: `expiresAt − serverNow` from the API, never the device clock.

## Correctness Properties

- Property 1: `<Timer seconds={252} label="sisa waktu memilih" compact />` renders one `role="timer"` with
  `data-compact`, the text "4:12", and the label text present in the DOM. **Validates: Requirements 1, 3**
- Property 2: `<Timer seconds={252} label="x" />` has no `data-compact` attribute and the same element structure, classes
  and attributes as before this change; the three existing `Timer` tests pass unmodified.
  **Validates: Requirements 3**
- Property 3: with `compact`, `seconds={60}` gives `aria-live="polite"` (warning) and `seconds={61}` gives `"off"`;
  `seconds={0}` shows "0:00" and is still warning; `compact` does not change the warning rule.
  **Validates: Requirements 2**
- Property 4: `timer.module.css` keeps its first line `@reference "../../../styles/app.css";` and its existing rules;
  the added rules are all under `[data-compact]`, set `text-[22px]`, `3px 3px 0 var(--color-ink)` and `sr-only` for the
  label outside `@variant md`, restate `text-[34px]`, the 4px offset and `not-sr-only` inside it, give the warning a
  `var(--color-pink)` plate in both, and contain no hex colour and no `transition` / `animation`.
  **Validates: Requirements 2, 3**
- Property 5: with the controller's `timer = { seconds: 252, label: 'order_timer_label' }` the Order screen renders two
  timers (flow bar and app bar; jsdom applies no CSS), both inside the `banner`, both with `data-compact`, both showing
  "4:12" and the label; with `seconds: 60` both have `aria-live="polite"`, with `seconds: 61` both `"off"`.
  **Validates: Requirements 1, 2, 4**
- Property 6: with `timer: null` the Order screen renders no `role="timer"` in the ready, loading, error and not-found
  states; `timeUp: true` with a timer changes nothing else on the page. **Validates: Requirements 4**
- Property 7: `id.json` has `order_timer_label` = "sisa waktu memilih", `en.json` = "left to choose"; both files have the
  same key set. **Validates: Requirements 5**
- Property 8: `resolveScenario('?mock=short_window', null)` is `'short_window'`; under it the categories mock answers
  with `Date.parse(expiresAt) − Date.parse(serverNow) === 75_000` and the same categories as `ok`; under `ok` the
  difference is still `300_000`. **Validates: Requirements 6**
- Property 9: `FlowHeader/index.tsx`, `flow-header.module.css` and `QueueTurn` have no diff; no new directory under
  `src/presentation/components/`; the build output `out/order.html` has scoped class names.
  **Validates: Requirements 1, 3, 7**

## Error Handling

No API call in this layer. Every `getCategories` outcome reaches the page through the controller (spec 59 Error
Handling), and the timer follows `timer`:

| Outcome (spec 59)                                         | Page (unchanged)                 | Timer                 |
| --------------------------------------------------------- | -------------------------------- | --------------------- |
| 200 `ok`, valid dates                                     | categories, holders              | shown, counting       |
| 200 `ok`, unparseable `expiresAt` / `serverNow`           | categories, holders              | not rendered          |
| no token, 403 `ADMISSION_INVALID`                         | redirect to `/queue?event=<id>`  | not rendered          |
| 401 `UNAUTHORIZED`                                        | error view, `error_unauthorized` | not rendered          |
| 5xx `INTERNAL_ERROR`, `NETWORK_ERROR`, `TIMEOUT`, unknown | error view + "Coba lagi"         | not rendered          |
| `getEvent` 404 `NOT_FOUND` / other failure                | not-found view / error view      | not rendered          |
| time runs out (not an API error)                          | unchanged in this ticket         | "0:00", warning style |

States covered: loading (skeleton, no timer), ready (timer), ready in the last minute (pink from "1:00"), ready at zero
("0:00" pink, page otherwise unchanged until FR-18-W1), error, not-found, redirect, offline banner (unchanged; the
countdown keeps running from its anchor). Both languages: the label switches with the language; the seconds do not
reset (spec 59 Requirement 4). The segment fallback `src/app/order/error.tsx` is unchanged and shows no timer.

## Testing Strategy

- `src/presentation/components/Timer/__tests__/index.test.tsx` (existing three tests untouched; additions):
  - `compact`: `data-compact` present, value and label in the DOM (Property 1); without it no attribute (Property 2);
  - `compact` with 60 / 61 / 0 seconds (Property 3);
  - the label once with the real ID and EN `order_timer_label` strings from `id.json` / `en.json`;
  - CSS module read as text (the `HolderList` test pattern) for Property 4.
- `src/presentation/pages/Order/__tests__/index.test.tsx`:
  - keep the existing `queryByRole('timer')` null assertion in the ready test (`base()` has `timer: null` since
    spec 59 task 3);
  - new: timer given → `getAllByRole('timer')` has length 2, each within `getByRole('banner')`, each with "4:12",
    `order_timer_label` and `data-compact`; 60 vs 61 seconds → `aria-live` polite vs off on both (Property 5);
  - new: `timer: null` in loading, error and not-found → no timer; `timeUp: true` renders the same page (Property 6).
- `src/infrastructure/i18n/__tests__/i18n.test.ts`: `id.order_timer_label` and `en.order_timer_label` values (parity
  already covers the key set).
- `src/infrastructure/mocks/__tests__/scenario.test.ts` and `booking.handlers.test.ts`: Property 8.
- `FlowHeader` and `QueueTurn` tests: unchanged.
- Gate: `npx tsc --noEmit && npx vitest --run && npm run build`; then the manual check with the mock API:
  - `/order?event=evt_samudra&mock=ok` at 390 and 1440, ID and EN: "5:00" counting down; label only at 1440; compact
    stamp in the app bar at 390; one timer visible at each width; typing in a name / NIK field keeps focus and caret
    while the timer ticks;
  - `/order?event=evt_samudra&mock=short_window`: "1:15" → pink from "1:00" → stays "0:00" pink; the page is otherwise
    unchanged at zero;
  - `?mock=slow`: no timer while the skeleton shows; `?mock=error`: no timer on the error view;
  - with the device clock set a day wrong: still "5:00" at load;
  - `/queue?event=evt_samudra&mock=near_front` at 390 and 1440: the turn timer looks exactly as before.
  - Mock caveat: the mock issues a fresh window on every `getCategories` request, so switching language restarts the
    countdown at the full window once the new answer arrives. The real API returns the same `expiresAt`; the "does not
    jump during the switch" behaviour is pinned by the spec 59 controller test.
