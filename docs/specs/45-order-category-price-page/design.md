# Design Document

## Overview

`CategoryList` (`src/presentation/pages/Order/components/CategoryList/`) renders two more cells per row, the status
label and the price, from the widened `OrderCategoryView` (spec 44). Sold-out rows get the HiFi `.is-out` style. The
row grid gets its HiFi columns except the stepper column (FR-13/14-W1). `OrderSkeleton` rows gain a price placeholder.
No new props, no new translation keys, no change to the shell, route or controller registration.

## Architecture

```
src/app/order/page.tsx                    unchanged
src/presentation/pages/Order/index.tsx    unchanged (passes categories from the controller)
src/presentation/pages/Order/components/
  CategoryList/index.tsx                  + status span, + price span, data attributes for state
  CategoryList/category-list.module.css   row grid with areas; .status, .price, sold-out and almost-gone styles
  OrderSkeleton/index.tsx                 + price placeholder per row
  OrderSkeleton/order-skeleton.module.css row grid matching CategoryList
```

Data flow: `orderController.categories` (already formatted and translated) → shell → `CategoryList categories` →
row cells. No API call in this layer; `getCategories` is the controller's (spec 14).

## Components and Interfaces

```ts
// src/presentation/pages/Order/components/CategoryList/index.tsx (props unchanged)
import type { OrderCategoryView } from '@utils/format/order-event';

interface CategoryListProps {
  heading: string;
  note: string;
  categories: OrderCategoryView[];
}

export default function CategoryList(props: CategoryListProps);
```

Row markup:

```tsx
<li key={category.id} className={styles.row} data-sold-out={category.soldOut || undefined}>
  <div className={styles.name}>
    <h3 className={styles.title}>{category.name}</h3>
    {category.description && <p className={styles.description}>{category.description}</p>}
  </div>
  {category.availabilityLabel && (
    <span className={styles.status} data-availability={category.availability ?? undefined}>
      {category.availabilityLabel}
    </span>
  )}
  <span className={styles.price}>{category.price}</span>
</li>
```

State goes through `data-*` attributes rather than class concatenation in JSX: CSS Modules select on them
(`.row[data-sold-out] .title`, `.status[data-availability='almost_gone']`), so the JSX has no string logic.

**Sold-out accessibility choice.** The DOM order (name, status, price) makes screen readers say
"Festival A, Berdiri · paling dekat panggung, Habis, Rp 1.250.000": the word comes before the price, so the price
reads as the category price, not a bargain. The strike-through is `text-decoration: line-through` in CSS on a plain
`span`; no `<s>` / `<del>` (announced by several screen readers as "deleted" / "strikethrough", which suggests an old
price next to a new one) and no extra visually hidden text (it would make "Habis" read twice). The price stays exposed:
hiding it would remove information sighted buyers have.

```ts
// src/presentation/pages/Order/components/OrderSkeleton/index.tsx (props unchanged)
// Each row: <span className={styles.row}><span className={styles.name} /><span className={styles.description} /><span className={styles.price} /></span>
```

## Data Models

Props come from `OrderControllerInterface.categories` (`OrderCategoryView`, spec 44):
`id`, `name`, `description?`, `price`, `availability: CategoryAvailability | null`, `availabilityLabel`, `soldOut`.
No new translation keys: the three `order_availability_*` keys belong to spec 44.

Measurements (HiFi `flow.css` 28–38, 72–75), phone base → `md` (720):

| Element            | Phone (< 720)                                                                                                | ≥ 720                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Row grid           | `minmax(0,1fr) auto`; areas `"n p" "s ."`; gap 6px 12px; py 14px                                             | `minmax(0,1fr) 120px 150px`; areas `"n s p"`; gap 20px; py 18px |
| Status (`.status`) | 600 12.5px, uppercase, tracking .04em, `ink-2`; `align-self: center`                                         | 600 13px, same                                                  |
| Almost gone        | `pink-ink`                                                                                                   | same                                                            |
| Price (`.price`)   | 700 16px `font-sans`, right, `tabular-nums`                                                                  | 700 18px                                                        |
| Sold out           | `h3` + price `ink-3`, price `line-through`; label `ink` on `paper-2`, padding 3px 6px, `justify-self: start` | same                                                            |

CSS sketch:

```css
.row {
  @apply grid items-center gap-x-3 gap-y-1.5 border-b border-hair py-3.5;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: 'n p' 's .';

  @variant md {
    @apply gap-5 py-[18px];
    /* + `auto` stepper column (area "st") in FR-13/14-W1 */
    grid-template-columns: minmax(0, 1fr) 120px 150px;
    grid-template-areas: 'n s p';
  }
}
.name {
  grid-area: n;
}
.status {
  grid-area: s;
  @apply self-center font-sans text-[12.5px] font-semibold tracking-[.04em] text-ink-2 uppercase;
  @variant md {
    @apply text-[13px];
  }
}
.status[data-availability='almost_gone'] {
  @apply text-pink-ink;
}
.price {
  grid-area: p;
  @apply text-right font-sans text-base font-bold tabular-nums;
  @variant md {
    @apply text-lg;
  }
}
.row[data-sold-out] .title,
.row[data-sold-out] .price {
  @apply text-ink-3;
}
.row[data-sold-out] .price {
  @apply line-through;
}
.row[data-sold-out] .status {
  @apply justify-self-start bg-paper-2 px-1.5 py-[3px] text-ink;
}
```

Tokens confirmed in `src/styles/app.css`: `--color-ink`, `--color-ink-2`, `--color-ink-3`, `--color-paper-2`,
`--color-pink-ink`, `--color-hair`, `--font-sans`.

**HiFi vs ADR / rule / scope differences:**

- HiFi phone status is 12px; the design-system rule sets "Smallest text 12.5px", so the status is 12.5px on phones.
- HiFi row has four columns and phone areas `"n p" "s st"`; the stepper is FR-13/14-W1, so desktop has three columns
  and phone `"n p" "s ."`. A CSS comment marks where the stepper column goes.
- HiFi sold-out stepper buttons are disabled; there is no stepper yet, so nothing is disabled here.
- SRS FR-12 says "jumlah tiket available"; the HiFi shows a label, not a count, and T-08 / Q-20 make stock optional
  and a snapshot. The page follows the HiFi.
- With an unknown availability (no label), the phone row keeps its empty second row (6px row gap); accepted for a rare
  fallback rather than a second grid template.

## Layer Constraints

From `.claude/rules/presentation.md`:

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
- Design tokens and patterns: see the design-system rule.
- Status never by colour alone: word + style.
- Focus visible on everything interactive; targets ≥ 44px; respects `prefers-reduced-motion`.
- `__tests__/index.test.tsx` for every page shell and section.
- React Testing Library; query by role and text, not test id; `userEvent` for interaction; mock `t` as `(k) => k`.
- Shells: mock `container.resolve` and assert props reach the sections.
- ❌ `useTranslation()` or `container.resolve()` in a section
- ❌ Tailwind classes in JSX, missing `.module.css`, missing `@reference`
- ❌ Direct imports from `@core/` or `@infrastructure/`
- ❌ `React.FC`, `forwardRef`, named component exports

From `.claude/rules/design-system.md`:

- Colour has a job: **pink = you**, **blue = the event**, **ink = actions**. Never swap.
- Trust zones (NIK, payment, summary) are quiet: no tilt, no halftone behind text.
- Tabular figures for anything that changes (numbers, timers, money). Smallest text 12.5px.
- Formats: `1.248`, `Rp 2.180.000`, `19.00 WIB`, `Sab, 12 Des 2026` (EN `1,248`, `Rp 2,180,000`, `7.00 pm WIB`,
  `Sat, 12 Dec 2026`).

From `.claude/rules/performance.md`:

- Don't let first-load JS grow by more than 5 KB per PR without a reason in the PR.

## Correctness Properties

- Property 1: each `li` has, in DOM order, the `h3`, then the status `span` (when `availabilityLabel !== ''`), then the
  price `span`. **Validates: Requirements 1, 2**
- Property 2: the price text equals `category.price` and the label text equals `category.availabilityLabel`; the
  section never calls `t`. **Validates: Requirements 1**
- Property 3: `availabilityLabel === ''` → no status element in that row; the price is still rendered.
  **Validates: Requirements 1**
- Property 4: `data-sold-out` is present iff `soldOut`; `data-availability` equals the enum value on every rendered
  label. **Validates: Requirements 2**
- Property 5: no `s`, `del` or `strike` element and no `aria-hidden` on the price anywhere in the list.
  **Validates: Requirements 2**
- Property 6: no `button`, `input` or `output` inside the list, and no number other than the price in a row.
  **Validates: Requirements 1**
- Property 7: the CSS module uses only theme tokens (no hex), `@reference` first, and the phone grid before the `md`
  variant. **Validates: Requirements 3**
- Property 8: skeleton rows have the same grid as the loaded rows, with a price placeholder. **Validates: Requirements 3**

## Error Handling

No new states and no new codes. Error, not-found, loading and the `ADMISSION_INVALID` redirect stay as in spec 15;
`getCategories` codes (`UNAUTHORIZED`, `ADMISSION_INVALID`, `NETWORK_ERROR`, `TIMEOUT`, `INTERNAL_ERROR`,
`RATE_LIMITED`, `UNKNOWN_ERROR`, unmapped) are handled by the controller and shown by `OrderMessage`. An unknown
`availability` value is not an error: the row shows name and price without a label (spec 44 fallback).

## Testing Strategy

- `src/presentation/pages/Order/components/CategoryList/__tests__/index.test.tsx`: fixtures with one row per
  availability (`available`, `almost_gone`, `sold_out`) and one unknown (`availability: null`, label `''`); in ID strings
  and one EN render.
  - Replace "shows the name only … `queryByText(/Rp/)` is null" with: name-only row still has its price and no empty
    `p`.
  - Each row shows its label and price text (`within(item).getByText('Rp 850.000')`, `'Tersedia'`).
  - DOM order: `item.textContent` has the name before the label before the price.
  - Sold-out row: `data-sold-out` set, label "Habis" present, `item.querySelector('s, del, strike')` is null, the price
    is in the accessible tree.
  - Unknown row: no label element, price present.
  - `queryByRole('button')` is null.
- `src/presentation/pages/Order/components/OrderSkeleton/__tests__/index.test.tsx`: still four rows, still
  `aria-hidden`; nothing new announced.
- `src/presentation/pages/Order/__tests__/index.test.tsx`: fixtures from spec 44; assert a fixture price reaches the
  list.
- Gate: `npx tsc --noEmit && npx vitest --run && npm run build`; then compare `/order?event=evt_samudra&mock=ok` with
  `analysis/hifi/shots/detail/default-1440x900.png` and `default-390x844.png` (left column, ignoring steppers), ID and
  EN.
