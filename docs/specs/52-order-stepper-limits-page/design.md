# Design Document

## Overview

Two presentation changes on `/order`, props-in / JSX-out:

1. `CategoryList` gains a `limitNotice` prop and renders the HiFi limit line after the list, inside a `role="status"`
   region that stays mounted so the line is announced when it appears.
2. The shell passes `limitNotice` from `orderController` (spec 51).

The stock-aware stepper needs no markup change: `CategoryList` already sets native `disabled` from `canIncrement` /
`canDecrement` and styles `data-sold-out` rows (specs 45, 49). This spec pins those states with tests now that the
controller sends sold-out and capped values (spec 50/51). No route change (`src/app/order/page.tsx` already wraps the
screen in `<Suspense>`), no DI change, no translation keys (spec 51 adds them).

## Architecture

```
src/app/order/page.tsx                         unchanged
src/presentation/pages/Order/index.tsx         + destructure limitNotice; pass it to CategoryList
src/presentation/pages/Order/components/
  CategoryList/index.tsx                       + prop limitNotice; status region + limit line after the ul
  CategoryList/category-list.module.css        + .limit, .limitCount
  CategoryList/__tests__/index.test.tsx        + limit line, region, sold-out / stale-pick disabled states, ID + EN
src/presentation/pages/Order/__tests__/index.test.tsx   + limitNotice reaches CategoryList
```

Data flow: `getCategories` (controller) → spec 50 use case (`limitReached`, `limitBelowMax`, caps) → spec 51
`limitNotice` and rows → shell → `CategoryList`. No API call in this layer.

## Components and Interfaces

```ts
// src/presentation/pages/Order/components/CategoryList/index.tsx
import type { OrderCategoryRow, OrderLimitNotice } from '@controllers/order.controller';

interface CategoryListProps {
  heading: string;
  note: string;
  categories: OrderCategoryRow[];
  onIncrement: (categoryId: string) => void;
  onDecrement: (categoryId: string) => void;
  /** Non-null when the order limit is reached: "3/3" + message. */
  limitNotice: OrderLimitNotice | null;
}

export default function CategoryList(props: CategoryListProps);
```

Markup added after `</ul>`, inside the `section`:

```tsx
<div role="status" aria-atomic="true">
  {limitNotice && (
    <p className={styles.limit}>
      <b className={styles.limitCount}>{limitNotice.count}</b> <span>{limitNotice.message}</span>
    </p>
  )}
</div>
```

- The wrapper has no class and no box when empty (a `div` with no content and no padding takes no height), so nothing
  shifts until the line appears; the `p` carries the 14px top margin.
- `role="status"` implies `aria-live="polite"`; `aria-atomic="true"` makes the reader read "3/3 Batas 3 tiket
  tercapai…" as one sentence. The region mounts with the section (status `ready`) and stays mounted while the line comes
  and goes, so insertion is announced (a region mounted together with its content is often not).
- The space between `</b>` and `<span>` keeps the accessible text "3/3 Batas…" readable; the flex gap does the visual
  spacing.

Shell (`src/presentation/pages/Order/index.tsx`): destructure `limitNotice` and pass `limitNotice={limitNotice}` to
`CategoryList`. No condition added.

Stepper (unchanged code, behaviour pinned): `disabled={!category.canDecrement}` / `disabled={!category.canIncrement}`.
Native `disabled` removes the button from the tab order and exposes `disabled` to the accessibility tree, so no
`aria-disabled` is added. A sold-out row at quantity 0 therefore has both buttons disabled and unfocusable; the row is
still read in DOM order name → "Habis" → price.

## Data Models

Props come from `OrderControllerInterface` (spec 51): `OrderLimitNotice { count: string; message: string }`,
`OrderCategoryRow` (unchanged type). Translation keys are spec 51's (`order_limit_reached_one/_other`,
`order_limit_reached_reserved_one/_other`); this spec adds none.

Measurements (HiFi `flow.css` line 39–40), same on phone and desktop:

| Element       | HiFi CSS                                                                                        | This spec (`@apply`, tokens from `src/styles/app.css`)                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `.limit`      | `margin-top:14px; font-size:14px; display:flex; gap:10px; align-items:center; color:var(--ink)` | `mt-3.5 flex items-center gap-2.5 text-sm text-ink` (font family inherits `font-sans`)                                                   |
| `.limitCount` | `background:var(--pink); color:#fff; font:800 15px/1 var(--disp); padding:4px 7px 3px`          | `shrink-0 bg-pink px-[7px] pt-1 pb-[3px] font-display text-[15px] leading-none font-extrabold whitespace-nowrap text-white tabular-nums` |

```css
/* category-list.module.css (additions) */

/* Limit line (HiFi .limit): the count on a pink plate ("pink = you"), the message in ink. */
.limit {
  @apply mt-3.5 flex items-center gap-2.5 text-sm text-ink;
}

.limitCount {
  @apply shrink-0 bg-pink px-[7px] pt-1 pb-[3px] font-display text-[15px] leading-none font-extrabold whitespace-nowrap text-white tabular-nums;
}
```

Tokens confirmed in `src/styles/app.css`: `--color-pink` (#d81f72), `--color-ink` (#141414), `--font-display`. White is
Tailwind's `text-white` (#fff, as the HiFi `color:#fff`), the same choice spec 49 made for the selected count. Contrast:
white on `pink` ≈ 4.9:1, ink on the paper background well above 7:1. The HiFi sets no `font-stretch` on `.limit b`;
none is added (port values exactly). No motion: the HiFi line has none, and it is not a hero element.

**HiFi / ADR differences recorded here:**

| Topic                | HiFi says                                               | This spec                                                                          |
| -------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| When the line shows  | `limit.hidden = total < MAX` with `MAX = 3`             | When `limitNotice` is non-null: at the order limit, which may be 1 or 2 (ADR-0004) |
| Reservation copy     | none                                                    | "Kuota giliran Anda {{count}} tiket. …" (proposed, spec 51)                        |
| Hidden state         | `hidden` attribute on the `p`                           | Line not rendered; the `role="status"` wrapper stays mounted (announcement)        |
| Live region          | none                                                    | `role="status"` + `aria-atomic` (presentation rule: live regions for updates)      |
| Sold-out row stepper | `disabled` on both buttons, labels "Kurangi" / "Tambah" | Same `disabled`; labels keep the category name (spec 48)                           |

## Layer Constraints

From `.claude/rules/presentation.md`:

- `'use client'` at the top.
- Zero hooks and zero logic of their own: `container.resolve<Interface>('xController')` at the top of render, then pass
  props to sections.
- Receive all data and callbacks as props, including `t`. Never call `useTranslation()` or `container.resolve()`.
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

From `.claude/rules/design-system.md`:

- Colour has a job: **pink = you**, **blue = the event**, **ink = actions**. Never swap.
- Print effects (misregistration, halftone, tilt, stamps) only on hero elements.
- Tabular figures for anything that changes (numbers, timers, money). Smallest text 12.5px.
- Source of truth: [Design Brief](../../../rusuh-documentation/product/design-brief.md) and the HiFi
  (`design/hifi/assets/rusuh.css`, `design/hifi/style-guide.html` in the project folder). Port values exactly; don't
  approximate with Tailwind's default palette.

From `.claude/rules/performance.md`:

- Don't let first-load JS grow by more than 5 KB per PR without a reason in the PR.

From `.claude/rules/error-handling.md`:

- Field-level codes (`NIK_INVALID`, `DUPLICATE_NIK`, `NIK_SEAT_TAKEN`, `WRONG_CODE`…) show under the field, not in a popup.

(The limit is neither an API error nor a field error: an inline status line, no popup, no `role="alert"`.)

## Correctness Properties

- Property 1: `CategoryList` always contains exactly one `role="status"` element with `aria-atomic="true"`; it is empty
  when `limitNotice` is `null`. **Validates: Requirements 1, 2**
- Property 2: with `limitNotice = { count: '3/3', message: M }`, the status element's text is `3/3 M`, the count is in a
  `b`, and the line comes after the `ul` in DOM order. **Validates: Requirements 1**
- Property 3: rerendering from `null` to a notice keeps the same status element node (same reference) and adds the
  line inside it; rerendering back to `null` empties it. **Validates: Requirements 2**
- Property 4: the CSS module defines `.limit` and `.limitCount` with the table's utilities, uses `bg-pink` / `text-ink` /
  `text-white`, and contains no hex colour. **Validates: Requirements 3**
- Property 5: a row with `soldOut: true, quantity: 0, canIncrement: false, canDecrement: false` has both buttons
  `disabled` (and no `aria-disabled`); a row with `soldOut: true, quantity: 1, canIncrement: false, canDecrement: true`
  has "−" enabled, and clicking it calls `onDecrement(id)`; clicking a disabled "+" calls nothing.
  **Validates: Requirements 4**
- Property 6: with real ID strings the line reads "3/3 Batas 3 tiket tercapai. Kurangi satu untuk ganti kategori."; with
  real EN strings "3/3 You've hit the 3-ticket limit. Remove one to switch category."; the reserved variant renders
  "2/2 Kuota giliran Anda 2 tiket. …". **Validates: Requirements 1, 5**
- Property 7: the shell renders the limit line when the fake controller has a non-null `limitNotice`, and none when it
  is `null`. **Validates: Requirements 1, 5**

## Error Handling

No new API calls. The page states stay as in specs 15, 45 and 49: loading (skeleton; no limit region because
`CategoryList` is not rendered), error (`OrderMessage` with the `getCategories` code from `ERROR_CODE_MAP` + "Coba
lagi": `UNAUTHORIZED`, `NETWORK_ERROR`, `TIMEOUT`, `INTERNAL_ERROR`, `RATE_LIMITED`, `UNKNOWN_ERROR`), not-found
(`getEvent` `NOT_FOUND`), and the `ADMISSION_INVALID` redirect to the queue. `getMe` failures stay silent (spec 48).
Refused stepper changes (`SOLD_OUT`, `STOCK_REACHED`, `LIMIT_REACHED`) show as disabled buttons plus, for the limit, the
line. Hold errors (`QUANTITY_OVER_RESERVATION`, `CATEGORY_SOLD_OUT`, `NIK_SEAT_TAKEN`, `ACCOUNT_HAS_ACTIVE_BOOKING`)
belong to the hold, which is not built.

## Testing Strategy

- `CategoryList/__tests__/index.test.tsx`:
  - Existing fixtures gain `limitNotice: null` in the default props.
  - `getByRole('status')` present and empty with `null`; with `{ count: '3/3', message: 'msg' }` it has text
    `3/3 msg` and `aria-atomic="true"`; `rerender` null → notice → null keeps the same node (Property 3).
  - Sold-out row at 0: both buttons `toBeDisabled()`, no `aria-disabled` attribute; `userEvent.click` on "+" does not
    call `onIncrement`. Stale pick: "−" enabled and calls `onDecrement('cat_a')`.
  - ID and EN: build the message from `id.json` / `en.json` (`order_limit_reached_other` with `{{count}}` → 3, and
    `order_limit_reached_reserved_other` with 2) and assert the rendered text.
- `src/presentation/pages/Order/__tests__/index.test.tsx`: fake controller with `limitNotice` non-null shows "3/3" in
  the status region; with `null` the region is empty.
- Gate: `npx tsc --noEmit && npm run lint && npx vitest --run && npm run build && npm run check:bundle`; then compare
  `/order?event=evt_samudra&mock=ok` at 390 and 1440, ID and EN, with HiFi `detail.html` (picks 2 × Festival B +
  1 × Tribun Atas → line "3/3"), step down to 2 (line gone), and a mock with `reservedUnits: 2` (line "2/2" with the
  reserved copy); check the sold-out row has both buttons disabled.
