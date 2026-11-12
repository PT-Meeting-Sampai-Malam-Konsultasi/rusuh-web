# Design Document

## Overview

Presentation changes on `/order`, props-in / JSX-out, all in `HolderList`:

1. The NIK `TextField` gets `error`, `valid`, a hint that switches to "Memeriksa ke Dukcapil…" while checking, and
   `aria-busy`.
2. A visually hidden `role="status"` region per holder announces "checking" and "valid" (errors are already announced by
   the `TextField`'s `role="alert"` line).
3. A "Periksa lagi" button under the NIK field when the controller says `canRecheck`.
4. The name `TextField` forwards `onBlur`.

Plus the translation keys of spec 55 and the hint example fix. No route change (`src/app/order/page.tsx` already wraps
the screen in `<Suspense>`), no DI change, no shell change (the shell already passes `holders` and `t`; spec 55 added
`allHoldersVerified` to its fake controller, which is not rendered until FR-16+). `TextField` is reused unchanged: it
already supports `error` / `valid` / `hint` and spreads `aria-busy` onto the input.

## Architecture

```
src/app/order/page.tsx                                  unchanged
src/presentation/pages/Order/index.tsx                  unchanged (passes holders, showHolderChoice, t)
src/presentation/pages/Order/components/HolderList/
  index.tsx                                             + error/valid/hint/aria-busy on NIK, status region,
                                                          recheck button, name onBlur
  holder-list.module.css                                + .nikCell, .recheck, .srOnly
  __tests__/index.test.tsx                              + every state, ID + EN
src/presentation/components/TextField/                  unchanged
src/translation/locale/id.json, en.json                 + 11 keys, hint example changed
src/infrastructure/i18n/__tests__/i18n.test.ts          + hint passes checkNik; EN plural
```

Data flow: `validateAttendee` (spec 53) → `validateAttendeeUseCase` (spec 54) → `orderController.holders[i].nik`
(spec 55) → shell → `HolderList` → `TextField`. No API call in this layer.

## Components and Interfaces

```ts
// src/presentation/pages/Order/components/HolderList/index.tsx (props unchanged)
import type { TFunction } from 'i18next';
import type { OrderHolderView } from '@controllers/order.controller';

interface HolderListProps {
  t: TFunction;
  showChoice: boolean;
  holders: OrderHolderView[]; // nik now carries error, valid, checking, canRecheck, recheck; name carries onBlur
}

export default function HolderList(props: HolderListProps);
```

Markup inside `.fields` (name field gains `onBlur`; the NIK field moves into a cell with the region and the button):

```tsx
<TextField
  id={holder.name.id}
  /* …unchanged… */
  onChange={(e) => holder.name.onChange(e.currentTarget.value)}
  onBlur={holder.name.onBlur}
/>
<div className={styles.nikCell}>
  <TextField
    id={holder.nik.id}
    label={t('order_holder_nik_label')}
    placeholder={t('order_holder_nik_placeholder')}
    hint={holder.nik.checking ? t('order_nik_checking') : t('order_holder_nik_hint')}
    error={holder.nik.error}
    valid={holder.nik.valid}
    aria-busy={holder.nik.checking || undefined}
    value={holder.nik.value}
    inputMode="numeric"
    autoComplete="off"
    spellCheck={false}
    onChange={(e) => holder.nik.onChange(e.currentTarget.value)}
    onFocus={holder.nik.onFocus}
    onBlur={holder.nik.onBlur}
  />
  <p className={styles.srOnly} role="status">
    {holder.nik.checking ? t('order_nik_checking') : (holder.nik.valid ?? '')}
  </p>
  {holder.nik.canRecheck && (
    <button
      type="button"
      className={styles.recheck}
      aria-describedby={`${holder.nik.id}-message`}
      onClick={holder.nik.recheck}
    >
      {t('order_nik_recheck')}
    </button>
  )}
</div>
```

Notes:

- The status region is inside the holder `li`, so it mounts with the block and stays mounted while its text changes;
  insertion of "Memeriksa ke Dukcapil…" and of the valid text is announced politely. It never repeats errors (the
  `role="alert"` line already announces them).
- While checking, the visible hint line says "Memeriksa ke Dukcapil…"; it is the `aria-describedby` target, so a reader
  returning to the field hears it too. `TextField` shows the hint only when there is no error or valid text, which the
  controller guarantees while checking.
- `aria-busy` is set only while checking (`|| undefined` removes the attribute otherwise). No `disabled` / `readOnly`: the
  buyer can correct the NIK mid-check (spec 55 drops the stale result).
- `${nik.id}-message` is `TextField`'s message id, so the button is read as "Periksa lagi, Dukcapil sedang sibuk…".
- Status is never by colour alone: error = red + "!" + text; valid = green + "✓" + text; checking = text.

## Data Models

Props come from `OrderHolderView` (spec 55). Translation keys (written here; table copied from spec 55):

| Key                               | ID                                                                                   | EN                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `order_nik_incomplete`            | NIK terdiri dari 16 digit.                                                           | A NIK has 16 digits.                                                                 |
| `order_nik_invalid_structure`     | Susunan angka ini bukan NIK KTP. Periksa lagi.                                       | These digits don't follow the KTP NIK pattern. Please check them.                    |
| `order_nik_duplicate`             | NIK ini sudah dipakai di Tiket {{index}}. Setiap tiket butuh NIK orang yang berbeda. | This NIK is already on Ticket {{index}}. Each ticket needs a different person's NIK. |
| `order_nik_checking`              | Memeriksa ke Dukcapil…                                                               | Checking with Dukcapil…                                                              |
| `order_nik_valid`                 | Nama dan NIK cocok dengan Dukcapil.                                                  | Name and NIK match Dukcapil's records.                                               |
| `order_nik_use_another`           | Gunakan NIK pemegang lain.                                                           | Use another holder's NIK.                                                            |
| `order_nik_rate_limited_one`      | Terlalu banyak percobaan untuk tiket ini. Coba lagi dalam {{count}} detik.           | Too many tries for this ticket. Try again in {{count}} second.                       |
| `order_nik_rate_limited_other`    | Terlalu banyak percobaan untuk tiket ini. Coba lagi dalam {{count}} detik.           | Too many tries for this ticket. Try again in {{count}} seconds.                      |
| `order_nik_rate_limited_later`    | Terlalu banyak percobaan untuk tiket ini. Coba lagi sebentar lagi.                   | Too many tries for this ticket. Please try again in a moment.                        |
| `order_nik_unavailable`           | Dukcapil sedang sibuk. Coba periksa lagi.                                            | Dukcapil is busy right now. Please check again.                                      |
| `order_nik_recheck`               | Periksa lagi                                                                         | Check again                                                                          |
| `order_holder_nik_hint` (changed) | Contoh: 3201 1252 0396 0001                                                          | Example: 3201 1252 0396 0001                                                         |

The new example `3201125203960001`: province 32, day 52 (12, woman), month 03, serial 0001 — passes spec 54's rule. The
old `3201 1234 5678 0001` has day 34 and would show "Susunan angka ini bukan NIK KTP" if a buyer copied it.

Styles (`holder-list.module.css` additions; tokens from `src/styles/app.css`):

```css
/* NIK field + its live region + "Periksa lagi": one grid cell, so the 2-column layout from 720px is unchanged. */
.nikCell {
  @apply grid content-start gap-2.5;
}

/* Quiet secondary action in the trust zone: ink = actions, no offset shadow, no print effect. */
.recheck {
  @apply min-h-11 justify-self-start border-[2.5px] border-ink bg-card px-3.5 font-sans text-sm font-semibold text-ink;
  transition:
    background-color 120ms,
    transform 90ms var(--ease-click);

  &:hover {
    @apply bg-paper-2;
  }

  &:focus-visible {
    @apply outline-3 outline-offset-3 outline-blue;
  }

  &:active {
    @apply translate-y-px;
  }

  &:disabled {
    @apply cursor-not-allowed bg-paper-2 text-ink-3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .recheck {
    transition: none;
  }
}

.srOnly {
  @apply sr-only;
}
```

`min-h-11` = 44px (accessibility target). Focus outline matches the holder choice (`.option:has(:focus-visible)`).
Colours: `ink`, `card`, `paper-2`, `ink-3`, `blue` only; no hex. The `TextField` error/valid styles (`red`, `green`) are
reused unchanged.

**HiFi / ADR differences recorded here:**

| Topic                        | HiFi                          | This spec                                                                                                   |
| ---------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Locally correct NIK          | "✓ Format NIK valid"          | no tick until Dukcapil answers; then "✓ Nama dan NIK cocok dengan Dukcapil." (ADR-0007: name + NIK checked) |
| Name per ticket              | NIK fields only               | name + NIK per ticket (ADR-0007; `hifi-api-review.md` H-2, already built in spec 49)                        |
| Checking / busy / rate limit | not drawn                     | hint line + status region; error line + "Periksa lagi" (customer journey F10, F18)                          |
| Hint example                 | "Contoh: 3201 1234 5678 0001" | "Contoh: 3201 1252 0396 0001" (passes the structure rule)                                                   |
| Section heading              | "NIK pemegang tiket"          | unchanged "Pemegang tiket" (spec 49: name + NIK)                                                            |

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
- Interactive elements define `:hover`, `:focus-visible`, `:disabled` and pressed states.
- Live regions: the queue number and ETA (`aria-live="polite"`), field errors (`role="alert"`), timers (`role="timer"`).
- Status never by colour alone: word + style.
- Focus visible on everything interactive; targets ≥ 44px; respects `prefers-reduced-motion`.
- `__tests__/index.test.tsx` for every page shell and section.
- React Testing Library; query by role and text, not test id; `userEvent` for interaction; mock `t` as `(k) => k`.
- ❌ `useTranslation()` or `container.resolve()` in a section
- ❌ Tailwind classes in JSX, missing `.module.css`, missing `@reference`
- ❌ Direct imports from `@core/` or `@infrastructure/`
- ❌ `React.FC`, `forwardRef`, named component exports
- ❌ `div` buttons, images without `alt`/size, barrel `index.ts` re-exports

From `.claude/rules/design-system.md`:

- Colour has a job: **pink = you**, **blue = the event**, **ink = actions**. Never swap.
- Trust zones (NIK, payment, summary) are quiet: no tilt, no halftone behind text.
- **Input:** 54px, card fill, ink border, blue offset on focus; error = red border + "!" message; valid = "✓".
- Short, warm, "Anda". ID first, full EN translation. Formats: `1.248`, `Rp 2.180.000`, `19.00 WIB`, `Sab, 12 Des 2026`
  (EN `1,248`, `Rp 2,180,000`, `7.00 pm WIB`, `Sat, 12 Dec 2026`). NIK masked as first 4 + last 4.

From `.claude/rules/error-handling.md`:

- Field-level codes (`NIK_INVALID`, `DUPLICATE_NIK`, `NIK_SEAT_TAKEN`, `WRONG_CODE`…) show under the field, not in a popup.
- ❌ Technical messages to users

From `.claude/rules/scaffold.md`:

- Resources: `src/translation/locale/id.json` and `en.json`, same keys in both, flat `snake_case`, single namespace.
- Copy comes from the HiFi / Design Brief voice rules; write ID first, then a full EN translation.

From `.claude/rules/performance.md`:

- Don't let first-load JS grow by more than 5 KB per PR without a reason in the PR.

## Correctness Properties

- Property 1: with `nik.error = 'E'` the NIK input has `aria-invalid="true"` and `getByRole('alert')` has text `E`; with
  `nik.valid = 'V'` the "✓ V" line shows and there is no alert; with neither (not checking) the hint
  `order_holder_nik_hint` shows. **Validates: Requirements 1**
- Property 2: with `checking: true` the NIK input has `aria-busy="true"`, is not disabled or read-only, accepts typing
  (`onChange` called), and its description (`aria-describedby` target) is `order_nik_checking`; with `checking: false`
  there is no `aria-busy` attribute. **Validates: Requirements 2**
- Property 3: each holder block contains exactly one `role="status"` element; its text is `order_nik_checking` while
  checking, the valid text when valid, empty otherwise; rerendering idle → checking → valid keeps the same node.
  **Validates: Requirements 2**
- Property 4: with `canRecheck: true` a button named `order_nik_recheck` is present, described by the message line, and a
  click calls `nik.recheck` once; with `false` there is no such button. **Validates: Requirements 3**
- Property 5: blurring the name input calls `name.onBlur`; blurring the NIK input calls `nik.onBlur`.
  **Validates: Requirements 4**
- Property 6: with real ID strings the duplicate line reads "NIK ini sudah dipakai di Tiket 1. Setiap tiket butuh NIK
  orang yang berbeda."; with real EN strings "This NIK is already on Ticket 1. Each ticket needs a different person's
  NIK."; EN `order_nik_rate_limited` gives "…1 second." for 1 and "…60 seconds." for 60. **Validates: Requirements 5, 6**
- Property 7: `id.json` and `en.json` have the same key set including the 11 new keys; `checkNik(toNikDigits(hint), [])`
  is `ok` for both locales' `order_holder_nik_hint`. **Validates: Requirements 5**
- Property 8: the CSS module defines `.nikCell`, `.recheck` (with hover, focus-visible, active, disabled and a
  reduced-motion rule) and `.srOnly`, uses only theme tokens, and contains no hex colour. **Validates: Requirements 3**

## Error Handling

No API call in this layer. Every `validateAttendee` outcome reaches the page as the controller's `nik.error` /
`nik.valid` / `checking` / `canRecheck` (spec 55 Error Handling): `NIK_INVALID` / `VALIDATION_FAILED`, `NIK_SEAT_TAKEN`,
`DUPLICATE_NIK`, `RATE_LIMITED` / `TOO_MANY_REQUESTS` (+ "Periksa lagi"), `DUKCAPIL_UNAVAILABLE` / 5xx / `NETWORK_ERROR` /
`TIMEOUT` (+ "Periksa lagi"), unclassified codes via `ERROR_CODE_MAP` (+ "Periksa lagi"), and `ADMISSION_INVALID` as a
redirect to `/queue?event=<id>` (no field message). Local errors (16 digits, structure, duplicate) use the same error
line. The page states of specs 15, 45, 49 and 52 (loading, error + "Coba lagi", not found, admission redirect, offline
banner) are unchanged.

## Testing Strategy

- `HolderList/__tests__/index.test.tsx` (t mocked as `(k) => k`, fixture builder with the spec 55 fields):
  - idle: hint shown, no alert, no `aria-busy`, status empty, no recheck button.
  - checking: Property 2 and 3 (`userEvent.type` into the busy field calls `onChange`).
  - valid: "✓" line and status text; no alert.
  - errors: one case each for a local message, `error_nik_invalid`, the seat-taken pair, `error_duplicate_nik`, a
    rate-limited and an unavailable message with `canRecheck: true` (button present, click calls `recheck`).
  - rerender idle → checking → valid keeps the status node (`toBe`).
  - name and NIK blur (Property 5).
  - ID and EN: render with the real strings from `id.json` / `en.json` (interpolate `{{index}}` → 1) for the duplicate
    line, and the rate-limited line with 60.
- `src/infrastructure/i18n/__tests__/i18n.test.ts`: parity covers the new keys; EN `order_nik_rate_limited` singular /
  plural with the real instance; `ValidateAttendeeUseCase({ bookingService: {} as never }).checkNik(...)` on both hint
  examples is `ok`.
- Shell test: unchanged behaviour (holders already reach `HolderList`); spec 55 added `allHoldersVerified` to the fake.
- Gate: `npx tsc --noEmit && npx vitest --run && npm run build`; then manual check of `/order?event=evt_samudra&mock=ok`
  at 390 and 1440, ID and EN, with the spec 53 sample NIKs (`…0004` valid, `…9999`, `…8888`, `…7777` + "Periksa lagi",
  `…6666`), a repeated NIK on ticket 2, a 15-digit NIK blurred, and `?mock=dukcapil_down`.
