# Design Document

## Overview

Three presentation changes on `/order`, all props-in / JSX-out:

1. `CategoryList` rows gain the stepper (fourth grid column on desktop, second line on phones) and the selected style.
2. New section `HolderList` ("2 Pemegang tiket") under `CategoryList`, one block per ticket, reusing the shared
   `TextField` for both fields.
3. `OrderSkeleton` rows gain a stepper placeholder so the loaded grid matches.

The shell passes the new controller fields through. No route change (`src/app/order/page.tsx` already wraps the screen
in `<Suspense>`), no DI change (the shell already imports `@infrastructure/di/controllers/order`).

## Architecture

```
src/app/order/page.tsx                         unchanged
src/presentation/pages/Order/index.tsx         + onIncrement/onDecrement to CategoryList; + HolderList when ready && showHolders
src/presentation/pages/Order/components/
  CategoryList/index.tsx                       + stepper, data-selected; props onIncrement, onDecrement; categories: OrderCategoryRow[]
  CategoryList/category-list.module.css        4-column desktop grid, "n p" / "s st" phone grid, stepper + selected styles
  HolderList/index.tsx                         NEW section: head, blocks, radiogroup, two TextFields
  HolderList/holder-list.module.css            NEW
  HolderList/__tests__/index.test.tsx          NEW
  OrderSkeleton/index.tsx                      + stepper placeholder per row
  OrderSkeleton/order-skeleton.module.css      grid with the stepper column / area
src/presentation/components/TextField          reused as is (spreads value, onChange, onFocus, onBlur, readOnly, inputMode…)
```

Data flow: `orderController` (spec 48) → shell → `CategoryList` (`categories`, `onIncrement`, `onDecrement`) and
`HolderList` (`t`, `showChoice`, `holders`). No API call in this layer; `getCategories` / `getMe` belong to the
controller.

## Components and Interfaces

```ts
// src/presentation/pages/Order/components/CategoryList/index.tsx
import type { OrderCategoryRow } from '@controllers/order.controller';

interface CategoryListProps {
  heading: string;
  note: string;
  categories: OrderCategoryRow[];
  onIncrement: (categoryId: string) => void;
  onDecrement: (categoryId: string) => void;
}

export default function CategoryList(props: CategoryListProps);
```

Row markup (after the spec 45 cells):

```tsx
<li
  key={category.id}
  className={styles.row}
  data-sold-out={category.soldOut || undefined}
  data-selected={category.selected || undefined}
>
  {/* name block, status, price: unchanged (spec 45) */}
  <div className={styles.stepper}>
    <button
      type="button"
      className={styles.stepButton}
      aria-label={category.decrementLabel}
      disabled={!category.canDecrement}
      onClick={() => onDecrement(category.id)}
    >
      −
    </button>
    <output className={styles.count} aria-live="polite">
      <span key={category.quantity} className={styles.countValue}>
        {category.quantity}
      </span>
    </output>
    <button
      type="button"
      className={styles.stepButton}
      aria-label={category.incrementLabel}
      disabled={!category.canIncrement}
      onClick={() => onIncrement(category.id)}
    >
      +
    </button>
  </div>
</li>
```

The inner `span` is keyed by the count so it remounts and replays the CSS bump; the live region (`output`) stays
mounted, so the new number is announced.

```ts
// src/presentation/pages/Order/components/HolderList/index.tsx
import type { TFunction } from 'i18next';
import type { OrderHolderView } from '@controllers/order.controller';
import TextField from '@presentation/components/TextField';

interface HolderListProps {
  t: TFunction;
  /** False when the profile has no name or /me failed: no radiogroup. */
  showChoice: boolean;
  holders: OrderHolderView[];
}

export default function HolderList(props: HolderListProps);
```

Block markup:

```tsx
<section className={styles.section} aria-labelledby="order-holders-heading">
  <div className={styles.head}>
    <h2 className={styles.heading} id="order-holders-heading">
      <span className={styles.badge} aria-hidden="true">
        2
      </span>
      {t('order_holders_heading')}
    </h2>
    <p className={styles.note}>{t('order_holders_note')}</p>
  </div>
  <ul className={styles.list}>
    {holders.map((holder) => (
      <li key={holder.key} className={styles.block}>
        <div className={styles.blockHead}>
          <h3 className={styles.title} id={`order-holder-${holder.key}-title`}>
            {holder.title}
          </h3>
          {showChoice && (
            <div
              role="radiogroup"
              className={styles.choice}
              aria-label={t('order_holder_for_label')}
              aria-describedby={`order-holder-${holder.key}-title`}
            >
              <label className={styles.option} data-kind="self">
                <input
                  type="radio"
                  className={styles.radio}
                  name={holder.choiceName}
                  value="self"
                  checked={holder.holderType === 'self'}
                  disabled={holder.selfDisabled}
                  onChange={() => holder.choose('self')}
                />
                <span>{t('order_holder_self')}</span>
              </label>
              <label className={styles.option} data-kind="other">
                <input
                  type="radio"
                  className={styles.radio}
                  name={holder.choiceName}
                  value="other"
                  checked={holder.holderType === 'other'}
                  onChange={() => holder.choose('other')}
                />
                <span>{t('order_holder_other')}</span>
              </label>
            </div>
          )}
        </div>
        <div className={styles.fields}>
          <TextField
            id={holder.name.id}
            label={t('order_holder_name_label')}
            placeholder={t('order_holder_name_placeholder')}
            hint={holder.name.hint}
            value={holder.name.value}
            readOnly={holder.name.readOnly}
            autoComplete="off"
            onChange={(e) => holder.name.onChange(e.currentTarget.value)}
          />
          <TextField
            id={holder.nik.id}
            label={t('order_holder_nik_label')}
            placeholder={t('order_holder_nik_placeholder')}
            hint={t('order_holder_nik_hint')}
            value={holder.nik.value}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => holder.nik.onChange(e.currentTarget.value)}
            onFocus={holder.nik.onFocus}
            onBlur={holder.nik.onBlur}
          />
        </div>
      </li>
    ))}
  </ul>
</section>
```

Native radios give arrow-key navigation and skip the disabled "Saya sendiri"; the input is visually hidden but
focusable, and the `label` is the segment.

Shell (`src/presentation/pages/Order/index.tsx`) destructures the new fields and renders:

```tsx
{
  status === 'ready' && (
    <CategoryList
      heading={t('order_category_heading')}
      note={categoryNote}
      categories={categories}
      onIncrement={increment}
      onDecrement={decrement}
    />
  );
}
{
  status === 'ready' && showHolders && <HolderList t={t} showChoice={showHolderChoice} holders={holders} />;
}
```

`totalTickets` and `orderLimit` are not rendered in this ticket (summary and limit line are deferred).

## Data Models

Props come from `OrderControllerInterface` (spec 48): `OrderCategoryRow`, `OrderHolderView`, `OrderHolderType`,
`showHolders`, `showHolderChoice`. Translation keys are spec 48's; this spec adds none.

Measurements (Figma frames, HiFi `rusuh.css` 130–134 and `flow.css` 28–30, 42–45, 72–78), phone base → `md` (720):

| Element            | Phone (< 720)                                                                                                                                                                                               | ≥ 720                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Row grid           | `minmax(0,1fr) auto`; areas `"n p" "s st"`; gap 6px 12px                                                                                                                                                    | `minmax(0,1fr) 120px 150px auto`; areas `"n s p st"` |
| Stepper box        | `inline-flex`, 129×45, `border-[2.5px] border-ink bg-card`, `justify-self: end`, area `st`                                                                                                                  | same                                                 |
| Step button        | 42×40, 600 24px `font-sans`; hover `paper-2`; disabled `ink-3`, `not-allowed`; focus-visible blue outline; `::before` inset −2px −1px (hit ≥ 44×44)                                                         | same                                                 |
| Count (`output`)   | 40×40, `border-x-[2.5px] border-ink`, 800 23px `font-display`, stretch 75%, `tabular-nums`, centred                                                                                                         | 26px                                                 |
| Selected row       | `h3` `pink-ink`; count `bg-pink text-white`                                                                                                                                                                 | same                                                 |
| Bump               | `translateY(-.06em)` at 30%, 450ms `--ease-click`, no-preference only                                                                                                                                       | same                                                 |
| Holders section    | `mt-[34px]`; head like CategoryList                                                                                                                                                                         | `mt-[52px]`                                          |
| Holder block       | `border-b border-hair py-[22px]`; flex column gap 14px                                                                                                                                                      | same                                                 |
| Block head         | column, gap 12px                                                                                                                                                                                            | row, `justify-between`, `items-center`, gap 24px     |
| Block title (`h3`) | `font-display` 700 19px, stretch 85%                                                                                                                                                                        | 22px                                                 |
| Radiogroup         | `grid grid-cols-2`, full width, `border-[2.5px] border-ink`; options `min-h-[45px]`, divider 2.5px ink                                                                                                      | width 268px                                          |
| Option text        | 600 15px `font-sans`, centred                                                                                                                                                                               | same                                                 |
| Option states      | unchecked `bg-card text-ink`; checked self `bg-pink text-white`; checked other `bg-ink text-paper`; disabled `bg-paper-2 text-ink-3 cursor-not-allowed`; `:has(:focus-visible)` blue outline 3px offset 3px | same                                                 |
| Fields             | one column, gap 18px                                                                                                                                                                                        | two columns, gap 22px 28px                           |
| Skeleton stepper   | `h-[45px] w-[129px]` `bg-paper-2`, area `st`, `justify-self: end`                                                                                                                                           | fourth `auto` column                                 |

Tokens confirmed in `src/styles/app.css`: `ink`, `ink-3`, `hair`, `card`, `paper`, `paper-2`, `pink`, `pink-ink`,
`blue`, `--font-display`, `--font-sans`, `--ease-click`. White is `text-white` (#fff, as the HiFi
`.is-picked output{color:#fff}`).

**Figma vs ADR — decision to raise with the owner and the designer.** The Figma Booking state draws "Saya sendiri" as a
card "Nadia Saputri / NIK 3174 •••• •••• 0004 / ✓ Dari profil Anda · Ubah di Akun", and the Profile-without-NIK state
adds the hint "Profil Anda belum punya NIK." and a checkbox "Simpan NIK ini ke profil, supaya lain kali terisi
otomatis." All three need a NIK on the account. ADR-0007 ("The account no longer needs a NIK"), `openapi.yaml` line 57
("Profile. The account holds no NIK; each ticket carries an attendee NIK (ADR-0007).") and the `User` schema (no NIK
field) rule it out, and storing a NIK on the account would widen the UU PDP surface ADR-0007 limits. **Decision: build
the ADR-compatible variant** (Figma Profile-without-NIK minus the NIK hint and checkbox): "Saya sendiri" prefills the
name read-only with "Dari profil Anda.", the NIK stays empty with the normal placeholder and hint. If the owner wants a
saved profile NIK, it needs an ADR-0007 amendment and new endpoints first. The design-system rule's "'Myself' in pink
with a profile card" is met by the pink checked segment; the card itself is the dropped profile-NIK card.

**Other Figma / HiFi / rule differences:**

| Topic                        | Source says                                                       | This spec                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Input height                 | Figma 52px                                                        | 54px (`TextField`, design-system "Input: 54px"); rule wins                                                             |
| Step button size             | Figma 42×40                                                       | Drawn 42×40; hit area extended to ≥ 44×44 with `::before` (presentation rule "targets ≥ 44px")                         |
| Checked segment              | Figma frames show no visible checked fill (only disabled is grey) | Pink for "Saya sendiri", ink for "Orang lain" (design-system "pink = you", "ink = actions"); confirm with the designer |
| "Saya sendiri" on 2nd ticket | Figma draws it greyed on Tiket 2/3                                | Disabled (block, spec 47); no explanatory copy in Figma — open question                                                |
| Section 2 title              | HiFi "NIK pemegang tiket", NIK only                               | Figma "Pemegang tiket" with name + NIK (H-2, ADR-0007)                                                                 |
| HiFi new-field hint          | "Satu NIK untuk satu tiket."                                      | Figma "Contoh: 3201 1234 5678 0001"                                                                                    |
| Sold-out stepper             | Figma/HiFi disabled at 0                                          | Not here (FR-14-W1): + stays enabled on sold-out rows until then; the hold re-checks stock                             |
| Stepper on desktop           | HiFi 44×44 buttons                                                | Figma 129×45 on both breakpoints                                                                                       |
| Skeleton                     | No Figma loading frame                                            | Stepper placeholder added for grid parity (CLS), as spec 45 did for the price                                          |

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

(The shell's `status === 'ready' && showHolders` is the "one section per state" prop passing allowed by
`add-page.md`: "Showing one section per state (`step === …`) is prop passing, not logic".)

From `.claude/rules/design-system.md`:

- Colour has a job: **pink = you**, **blue = the event**, **ink = actions**. Never swap.
- Trust zones (NIK, payment, summary) are quiet: no tilt, no halftone behind text.
- Border width 2.5px ink; offsets 6px (cards, posters) and 4px (buttons, focus), 0 blur, in ink, pink or blue.
- Tabular figures for anything that changes (numbers, timers, money). Smallest text 12.5px.
- **Input:** 54px, card fill, ink border, blue offset on focus; error = red border + "!" message; valid = "✓".
- **Holder block:** "Saya sendiri / Orang lain" segmented control; "Myself" in pink with a profile card.
- Print pass on first entry (blue plate then pink, 550ms, stagger 60ms, once); number bump on update (450ms);
  "Giliran Anda!" slam and "HABIS" stamp (450–500ms); wrong-code shake (380ms). All off under
  `prefers-reduced-motion`.
- NIK masked as first 4 + last 4.

From `.claude/rules/performance.md`:

- Don't let first-load JS grow by more than 5 KB per PR without a reason in the PR.
- Above-the-fold content is never behind a dynamic import.

From `CLAUDE.md`: "NIKs are shown masked after entry and never logged."

## Correctness Properties

- Property 1: each row contains, after the price, two `button`s named `decrementLabel` / `incrementLabel` and an
  `output` with `aria-live="polite"` whose text is `quantity`. **Validates: Requirements 1**
- Property 2: "−" is `disabled` iff `!canDecrement`; "+" is `disabled` iff `!canIncrement`; clicks call the callback
  with the row id and nothing else. **Validates: Requirements 1**
- Property 3: `data-selected` is present iff `selected`; the DOM order name → status → price → stepper holds.
  **Validates: Requirements 1, 2**
- Property 4: the CSS module defines the phone areas `"n p" "s st"` before the `md` variant with
  `"n s p st"` and four columns; no hex colours. **Validates: Requirements 2**
- Property 5: `HolderList` renders nothing from the shell unless `status === 'ready' && showHolders`; it renders one
  `h3` per holder with `title`, in order. **Validates: Requirements 3**
- Property 6: with `showChoice`, each block has a `radiogroup` named `order_holder_for_label` containing two radios;
  "Saya sendiri" is `checked` iff `holderType === 'self'` and `disabled` iff `selfDisabled`; selecting a radio calls
  `choose` with its value. Without `showChoice` there is no `radio` in the section. **Validates: Requirements 4**
- Property 7: the name input has `readOnly` iff `name.readOnly` and its description is `name.hint`; the NIK input has
  `inputmode="numeric"`, `autocomplete="off"`, value `nik.value`, and calls `onFocus` / `onBlur` / `onChange`.
  **Validates: Requirements 4**
- Property 8: the section contains no checkbox, no "Ubah di Akun" link and no text matching `/belum punya NIK/`.
  **Validates: Requirements 4**
- Property 9: the block head stacks on phones and is one row from 720px; fields are one column on phones and two from
  720px; segments have the checked / disabled styles of the table; animations sit inside
  `prefers-reduced-motion: no-preference`. **Validates: Requirements 5**
- Property 10: skeleton rows contain a stepper placeholder in the `st` area; still four rows, `aria-hidden`.
  **Validates: Requirements 6**
- Property 11: no string literal copy in the new JSX except the glyphs "−", "+" and the badge "2"; ID and EN renders
  show the spec 48 strings. **Validates: Requirements 7**

## Error Handling

No new API calls in this layer. The page states stay as in specs 15 and 45: loading (skeleton), error (`OrderMessage`
with the `getCategories` code from `ERROR_CODE_MAP` + "Coba lagi"), not-found, and the `ADMISSION_INVALID` redirect to
the queue. `getMe` failures (401, `NETWORK_ERROR`, `TIMEOUT`, `INTERNAL_ERROR`, `RATE_LIMITED`, `UNKNOWN_ERROR`) render
as `showChoice: false`: the blocks show plain name and NIK fields, never an error. NIK field errors
(`NIK_INVALID`, `DUPLICATE_NIK`, `NIK_SEAT_TAKEN`) are FR-15-W1; `TextField` already supports the `error` prop for them.

## Testing Strategy

- `CategoryList/__tests__/index.test.tsx`: stepper per row with names from the fixture labels; disabled states; click
  calls `onIncrement` / `onDecrement` with the id; `aria-live` on `output`; `data-selected` only on selected rows; keep
  the spec 45 assertions; the old `queryByRole('button')` is null assertion is replaced.
- `HolderList/__tests__/index.test.tsx`: titles in order; radiogroup by name, radios checked/disabled, `userEvent.click`
  on "Orang lain" calls `choose('other')`; no radios when `showChoice` is false; name read-only with the profile hint;
  NIK attributes and focus/blur/change callbacks (`userEvent.type` on the NIK calls `onChange`); no checkbox / "Ubah di
  Akun" / "belum punya NIK"; one render with real ID strings and one with EN.
- `OrderSkeleton/__tests__/index.test.tsx`: four rows, each with a stepper placeholder; still `aria-hidden`.
- `src/presentation/pages/Order/__tests__/index.test.tsx`: fake controller with the spec 48 fields; holders section
  absent when `showHolders` is false or status is not `ready`; present with a holder title otherwise;
  `increment` / `decrement` reach `CategoryList`.
- Gate: `npx tsc --noEmit && npm run lint && npx vitest --run && npm run build && npm run check:bundle`; then compare
  `/order?event=evt_samudra&mock=ok` at 390 and 1440, ID and EN, with `mobile-60-2486.png`, `desktop-60-2088.png`,
  `holders-profile-without-nik-desktop.png` (left column, sections 1–2 only), stepping 0 → 3 and back, and checking
  that values stay on their ticket and NIKs mask on blur.
