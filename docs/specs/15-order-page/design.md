# Design Document

## Overview

Route `src/app/order/page.tsx` (+ `error.tsx`) → `OrderScreen` shell → shared `FlowHeader`, then one of
`OrderSkeleton`, `OrderMessage`, or `OrderEventHeader` + `CategoryList`. Shared `Poster` gains a `thumb` size. Ported
from the HiFi left column (`flow-main`); the summary aside, dock, NIK and email sections are later tickets.

## Architecture

```
src/app/order/page.tsx           server component: metadata + <Suspense fallback={<OrderSkeleton withHeader />}>
src/app/order/error.tsx          'use client' segment fallback (static)
src/presentation/pages/Order/
  index.tsx                      'use client' shell: container.resolve<OrderControllerInterface>('orderController')
  order.module.css
  components/
    OrderEventHeader/            poster thumb + h1 + meta line
    CategoryList/                section "1 Kategori" + note + ul
    OrderSkeleton/               loading + route fallback
    OrderMessage/                error / not-found
src/presentation/components/
  FlowHeader/                    new, shared by order / payment / e-ticket
  Poster/                        + size 'thumb', + loading prop
```

Shell render (every state keeps the header):

```tsx
<div className={styles.page}>
  <FlowHeader … />
  <main className={styles.main} aria-busy={status === 'loading'}>
    <div className={styles.flowMain}>
      {status === 'loading' && <OrderSkeleton label={t('state_loading')} />}
      {status === 'error' && <OrderMessage title={t('order_error_title')} body={errorMessage}
                                           actionLabel={t('action_retry')} onAction={retry}
                                           homeHref={homeHref} homeLabel={t('action_back_home')} />}
      {status === 'not-found' && <OrderMessage title={t('order_not_found_title')} body={t('order_not_found_body')}
                                               homeHref={homeHref} homeLabel={t('action_back_home')} />}
      {status === 'ready' && event && <OrderEventHeader event={event} />}
      {status === 'ready' && <CategoryList heading={t('order_category_heading')} note={categoryNote}
                                           categories={categories} />}
    </div>
    {/* Summary aside: FR-13-W1 / FR-14-W1 */}
  </main>
</div>
```

## Components and Interfaces

```ts
// src/presentation/components/FlowHeader/index.tsx
import type { ReactNode } from 'react';
import type { SwitchLocale } from '@presentation/components/LanguageSwitch';

export interface FlowHeaderStep {
  number: 1 | 2 | 3;
  label: string;
  current: boolean;
}

interface FlowHeaderProps {
  homeHref: string;
  steps: FlowHeaderStep[];
  locale: SwitchLocale;
  onLocaleChange: (locale: SwitchLocale) => void;
  backHref: string;
  /** Phone app bar title ("Pilih tiket"). */
  title: string;
  labels: { home: string; steps: string; language: string; back: string };
  /** Countdown (FR-17-W1). Rendered in both bars when present; nothing otherwise. */
  timer?: ReactNode;
}

export default function FlowHeader(props: FlowHeaderProps);
```

One `header` element holding two bars: `.bar` (≥ 720: logo, `ol` steps shown ≥ 1180, right group with
`LanguageSwitch` + timer slot) and `.appBar` (< 720: back link, title, timer slot). Shell wiring: `homeHref`, `steps`,
`locale`, `onLocaleChange={setLocale}`, `backHref`, `title={t('order_title')}`,
`labels={{ home: t('logo_home_label'), steps: t('order_steps_label'), language: t('language_switch_label'),
back: t('order_back_label') }}`. `FlowHeaderStep` and the controller's `FlowStep` are structurally identical (same
pattern as `AppHeader`'s `NavLink` and Home's `NavItem`).

```ts
// src/presentation/components/Poster/index.tsx (change)
interface PosterProps {
  tone: PosterTone;
  size: 'hero' | 'card' | 'thumb'; // + 'thumb': 58×72 phone, 84×104 ≥ 720; title only, no kicker/waves/subtitle/meta
  // … existing props unchanged
  /** Above-the-fold artwork (the order page thumb) loads eagerly. Default 'lazy'. */
  loading?: 'lazy' | 'eager';
}
```

```ts
// Sections import the view types from the formatter file, as Home's sections import EventCardView.
import type { OrderCategoryView, OrderEventView } from '@utils/format/order-event';

// src/presentation/pages/Order/components/OrderEventHeader/index.tsx
interface OrderEventHeaderProps {
  event: OrderEventView;
}

// src/presentation/pages/Order/components/CategoryList/index.tsx
interface CategoryListProps {
  heading: string;
  note: string;
  categories: OrderCategoryView[];
}

// src/presentation/pages/Order/components/OrderSkeleton/index.tsx
interface OrderSkeletonProps {
  /** Visually hidden status text; absent in the route fallback (no translations on the server). */
  label?: string;
  /** Route fallback only: a placeholder bar with the flow header's height, so nothing shifts when the screen mounts. */
  withHeader?: boolean;
}

// src/presentation/pages/Order/components/OrderMessage/index.tsx
interface OrderMessageProps {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  homeHref: string;
  homeLabel: string;
}
```

`OrderEventHeader` passes `tone={event.posterTone}`, `size="thumb"`, `title={event.name}`, `imageUrl`,
`loading="eager"` to `Poster`; the `h1` holds the name and a `span` with the subtitle; a `p` holds `metaLine`.
`CategoryList` uses `useId`-free static ids (`order-categories-heading`, `order-categories-note`) because there is one
list per page; the `ul` has `aria-describedby` pointing at the note. `OrderMessage` uses the shared `Button` for the
action and a `next/link` styled as a link for Home.

```tsx
// src/app/order/page.tsx
import { Suspense } from 'react';
import OrderScreen from '@presentation/pages/Order';
import OrderSkeleton from '@presentation/pages/Order/components/OrderSkeleton';

export const metadata = { title: 'Pilih tiket' };

export default function Page() {
  return (
    <Suspense fallback={<OrderSkeleton withHeader />}>
      <OrderScreen />
    </Suspense>
  );
}
```

`src/app/order/error.tsx` follows `src/app/error.tsx` exactly (`StatusScreen`, `Button`, `Link`, `i18n.t`,
`container.resolve('analyticsAdapter').reportError(error, { boundary: 'order' })` in `useEffect`), styling the Home
link with `../fallback.module.css`.

## Data Models

Props come from `OrderControllerInterface` (spec 14). Translation keys added by this spec:

| Key                      | ID                                                                     | EN                                                                                |
| ------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `order_title`            | Pilih tiket                                                            | Choose tickets                                                                    |
| `order_steps_label`      | Langkah                                                                | Steps                                                                             |
| `order_back_label`       | Kembali                                                                | Back                                                                              |
| `order_category_heading` | Kategori                                                               | Category                                                                          |
| `order_error_title`      | Kategori gagal dimuat.                                                 | The categories didn't load.                                                       |
| `order_not_found_title`  | Event tidak ditemukan.                                                 | Event not found.                                                                  |
| `order_not_found_body`   | Event ini tidak ada atau tautannya salah. Lihat event lain di beranda. | This event doesn't exist or the link is wrong. See other events on the home page. |

Reused: `logo_home_label`, `language_switch_label`, `action_retry`, `action_back_home`, `state_loading`,
`error_page_title`, `error_page_body`.

Measurements (HiFi `assets/flow.css`, `assets/rusuh.css`), phone base → `md` (720) → `lg` (1180):

| Element      | Phone                                                                                            | ≥ 720                                                                                                                   | ≥ 1180                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Flow grid    | block, padding-top 18, bottom 48                                                                 | grid `minmax(0,1fr) 340px`, gap 40, padding 40 / 80                                                                     | `minmax(0,1fr) 400px`, gap 72                                                                                        |
| Header       | app bar 60 px sticky, 2.5 px ink bottom border                                                   | header bar: logo + switch + timer slot                                                                                  | + steps                                                                                                              |
| Steps        | —                                                                                                | hidden                                                                                                                  | 15px Space Grotesk 600, `ink-3`; number box 26×26, 2px border; current: ink fill, paper text; 34 px `hair` connector |
| Event header | gap 14; thumb 58×72, 3px ink offset; h1 30px; subtitle block, .55em, margin-top 4                | gap 22; thumb 84×104, `--shadow-off-s`; h1 48px; subtitle inline, .5em, margin-left 6                                   | —                                                                                                                    |
| Meta line    | 13px, margin-top 4, `ink-2`                                                                      | 15px, margin-top 8                                                                                                      | —                                                                                                                    |
| Section      | margin-top 34; heading column, gap 6; h2 26px; badge 28×28                                       | margin-top 52; heading row, `space-between`, baseline, gap 32; h2 Display M; badge 36×36; note max 420px, right-aligned | —                                                                                                                    |
| Section rule | 2.5 px ink under the heading, padding-bottom 12                                                  | same                                                                                                                    | —                                                                                                                    |
| Category row | padding 14 0; 1px `hair` bottom; h3 Bricolage 700 19px stretch 85%; p 13px `ink-2`, margin-top 3 | padding 18 0; h3 22px; p 14px                                                                                           | —                                                                                                                    |

Subtitle colour `pink-ink` (HiFi); badge ink fill with paper text (Bricolage 800, stretch 75%). App bar title
Bricolage 700 19px stretch 85%; back link 44×44, `font 500 24px`.

**HiFi vs ADR / scope differences:**

- HiFi category rows have four columns (name, status, price, stepper); this ticket renders the name column only. The
  row stays a grid with one column so FR-12/13-W1 add columns without restructuring.
- HiFi shows a running timer in both bars; the slot is empty until FR-17-W1.
- HiFi review H-1: the HiFi summary charges the fee per ticket; ADR-0010 (per order) wins. Not rendered here; the
  summary ticket (FR-13/14-W1) must follow the ADR.
- HiFi review H-6: the HiFi has no login sheet; ADR-0006 requires one inside the order window. NFR-07-W2; until then
  401 shows the error state.
- HiFi review H-5: the email field becomes read-only text (later ticket; the section is not built here).
- HiFi phone app bar has no language switch; this spec follows the HiFi (open question in `tasks.md`).
- HiFi back link points to `waiting-room.html`; here it is `/queue?event=<id>` (route table).
- Route metadata is static, so the tab title is "Pilih tiket · Rusuh" in both languages.

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
- Runtime images live in `public/` and are referenced by literal path; give `width`, `height`, `alt`; `loading="lazy"`
  below the fold. `next/image` works only unoptimized (export mode).
- Status never by colour alone: word + style.
- Focus visible on everything interactive; targets ≥ 44px; respects `prefers-reduced-motion`.
- `__tests__/index.test.tsx` for every page shell and section.
- React Testing Library; query by role and text, not test id; `userEvent` for interaction; mock `t` as `(k) => k`.
- Shells: mock `container.resolve` and assert props reach the sections.
- ❌ Direct imports from `@core/` or `@infrastructure/`
- ❌ `div` buttons, images without `alt`/size, barrel `index.ts` re-exports

From `.claude/rules/design-system.md`:

- One loud thing per screen (Home: poster · Waiting room: your number · Detail: picks + timer · Payment: timer + pay ·
  E-ticket: "Sampai jumpa").
- Colour has a job: **pink = you**, **blue = the event**, **ink = actions**. Never swap.
- Print effects (misregistration, halftone, tilt, stamps) only on hero elements.
- Border width 2.5px ink; offsets 6px (cards, posters) and 4px (buttons, focus), 0 blur, in ink, pink or blue.
- Content max width 1328px; gutters 56px desktop, 16px phone.
- Tabular figures for anything that changes (numbers, timers, money). Smallest text 12.5px.
- Print pass on first entry (blue plate then pink, 550ms, stagger 60ms, once); number bump on update (450ms);
  "Giliran Anda!" slam and "HABIS" stamp (450–500ms); wrong-code shake (380ms). All off under
  `prefers-reduced-motion`.
- Short, warm, "Anda". ID first, full EN translation. Formats: `1.248`, `Rp 2.180.000`, `19.00 WIB`, `Sab, 12 Des 2026`
  (EN `1,248`, `Rp 2,180,000`, `7.00 pm WIB`, `Sat, 12 Dec 2026`). NIK masked as first 4 + last 4.

From `.claude/rules/performance.md`:

| Metric | Green    |
| ------ | -------- |
| LCP    | ≤ 2.5 s  |
| INP    | ≤ 200 ms |
| CLS    | ≤ 0.1    |

- Don't let first-load JS grow by more than 5 KB per PR without a reason in the PR.
- Keep route files as server components; put `'use client'` as deep as the architecture allows (page shells), so static
  chrome stays HTML.
- Images: explicit `width`/`height`, `loading="lazy"` below the fold, WebP/AVIF from `public/`.
- Above-the-fold content is never behind a dynamic import.

From `.claude/rules/error-handling.md`:

- Error files are client components (`'use client'`) and receive `{ error: unknown, retry: () => void }` in this
  Next.js version (not `reset`). Check `node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md`.
- Fallbacks are static: no API calls, no DI resolution, no hooks beyond logging in `useEffect`.
- Log the error (analytics adapter or `reportError`) before showing the fallback. Never show stack traces or status codes.
- Segment fallback keeps the layout and offers "Coba lagi" (`retry()`) and a way back (Home).

## Correctness Properties

- Property 1: the shell renders exactly one of skeleton, error message, not-found message or content per `status`, and
  `FlowHeader` in all four. **Validates: Requirements 2, 5**
- Property 2: exactly one `h1` per state (event name when ready, message title in error / not-found); the skeleton has
  none. **Validates: Requirements 3, 5, 6**
- Property 3: the category list renders one `li` per category in the given order, each with an `h3`; no price,
  availability text or button inside it. **Validates: Requirements 4**
- Property 4: the not-found message has no retry button; the error message has one that calls `retry` once per click.
  **Validates: Requirements 5**
- Property 5: the step marked `aria-current="step"` is the one with `current: true`. **Validates: Requirements 2**
- Property 6: no section imports `container`, `useTranslation`, `@core/` or `@infrastructure/`. **Validates: Requirements 6**
- Property 7: no `timer` prop → no `role="timer"` element in the DOM. **Validates: Requirements 2**
- Property 8: `src/app/order/page.tsx` has no `'use client'` and wraps the screen in `Suspense`. **Validates: Requirements 1**

## Error Handling

| State                                                     | Shown                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `error` (any code, incl. `NETWORK_ERROR`, `UNAUTHORIZED`) | `OrderMessage` with `errorMessage` from the controller, "Coba lagi", "Ke beranda"     |
| `not-found` (no `event` param, `NOT_FOUND`)               | `OrderMessage` "Event tidak ditemukan.", "Ke beranda"                                 |
| `ADMISSION_INVALID` / no token                            | Skeleton until the controller's `router.replace` to `/queue?event=`                   |
| Render crash in the segment                               | `src/app/order/error.tsx`: logged, "Ada yang tidak beres.", "Coba lagi", "Ke beranda" |
| Offline                                                   | Existing `OfflineBanner` (providers) on top of whichever state                        |

## Testing Strategy

- `src/presentation/components/FlowHeader/__tests__/index.test.tsx`: logo link, steps list with `aria-current`,
  language switch calls `onLocaleChange`, back link href and label, no timer without `timer`, timer rendered when given.
- `src/presentation/components/Poster/__tests__/index.test.tsx`: `thumb` renders the title only; `loading="eager"`
  reaches the `img`.
- `src/presentation/pages/Order/components/*/__tests__/index.test.tsx`: one per section (event header text and heading
  level; list order and missing description; skeleton `aria-busy` / hidden label / `withHeader`; message with and
  without action).
- `src/presentation/pages/Order/__tests__/index.test.tsx`: mocked `container.resolve` for each of the four statuses;
  props reach the sections.
- Gate: `npm run build` (static export writes `out/order.html` with scoped class names), `npm run check:bundle`, then
  compare with the HiFi shots at 390 and 1440 in ID and EN, with `?mock=ok`, `slow`, `error`, `offline`,
  `admission_invalid` and an unknown event id.
