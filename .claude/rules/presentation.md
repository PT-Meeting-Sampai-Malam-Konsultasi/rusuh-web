---
paths:
  - "src/app/**"
  - "src/presentation/**"
---

# Presentation and routes

Presentation is the thinnest layer: props in, JSX out. No business logic.

## Route files (`src/app/**/page.tsx`)

- Server components (no `'use client'`). Only: `export const metadata` (or `generateMetadata` for static values) and
  rendering the screen from `@presentation/pages/...`.
- If the screen's controller reads search params, wrap it: `<Suspense fallback={<ScreenSkeleton />}><Screen /></Suspense>`.
  Without it the whole tree falls back to client rendering.
- No data fetching, no logic, no hooks.
- Routes, folders and file names are **English**, lower-case kebab-case; only the UI copy is Indonesian/English via
  i18n. Route names match the commit scopes:

  | Route | Screen | Search params |
  | --- | --- | --- |
  | `/` | Home | — |
  | `/queue` | Waiting room | `event` |
  | `/login` | Sign in / sign up | `next` (where to return) |
  | `/order` | Detail ticket (categories, holders) | `event` |
  | `/payment` | Payment (Snap) | `booking` |
  | `/tickets` | My tickets | — |
  | `/tickets/detail` | E-ticket | `booking` |
  | `/account` | Account | — |

  Ids are search params because the static export has no dynamic routes (`/queue?event=…`, `/payment?booking=…`).
  Keep the paths in `src/utils/constants/routes.ts`; never hard-code them in controllers.
- Every flow segment has an `error.tsx` (see the error-handling rule).

```tsx
// src/app/queue/page.tsx
import { Suspense } from 'react';
import WaitingRoomScreen from '@presentation/pages/Queue/WaitingRoom';
import WaitingRoomSkeleton from '@presentation/pages/Queue/WaitingRoom/components/WaitingRoomSkeleton';

export const metadata = { title: 'Ruang tunggu · Rusuh' };

export default function Page() {
  return (
    <Suspense fallback={<WaitingRoomSkeleton />}>
      <WaitingRoomScreen />
    </Suspense>
  );
}
```

## Page shells (`src/presentation/pages/{Domain}/{Page}/index.tsx`)

- `'use client'` at the top.
- Zero hooks and zero logic of their own: `container.resolve<Interface>('xController')` at the top of render, then pass
  props to sections.
- One shell per page, co-located `{page-name}.module.css`.

## Section components (`…/{Page}/components/{Section}/index.tsx`)

- Receive all data and callbacks as props, including `t`. Never call `useTranslation()` or `container.resolve()`.
- May hold visual micro-state only (accordion open, tooltip). Business state (step, modal triggered by the API) lives in
  the controller.
- Plain function declarations with a typed props interface; no `React.FC`, no `forwardRef` (React 19: `ref` is a prop).
- `export default` for every component.
- Semantic HTML: `main`, `section`, `h1`…, `button` for actions (never `div onClick`), `form` with labels.

## Styling (Tailwind 4 + CSS Modules)

- Every `.tsx` has a co-located `.module.css`.
- First line of every module: `@reference "<relative path>/styles/app.css";` (needed for `@apply` and theme tokens).
- `camelCase` class names; style with `@apply` and theme tokens; raw CSS only where Tailwind has no utility
  (e.g. `font-stretch`, keyframes, `text-shadow` plates).
- **No Tailwind class strings in JSX**, no inline `style` except CSS variables for dynamic values
  (`style={{ '--progress': `${p}%` }}`), no Sass, no CSS-in-JS.
- Mobile first: base styles target the phone (390), then `@variant md` / `lg` (or `@media (width >= …)`) for wider.
- Interactive elements define `:hover`, `:focus-visible`, `:disabled` and pressed states.
- Design tokens and patterns: see the design-system rule.

## Images and fonts

- Runtime images live in `public/` and are referenced by literal path; give `width`, `height`, `alt`; `loading="lazy"`
  below the fold. `next/image` works only unoptimized (export mode).
- Fonts through `next/font/local` in `layout.tsx`, exposed as CSS variables used by `@theme`.

## Accessibility

- Live regions: the queue number and ETA (`aria-live="polite"`), field errors (`role="alert"`), timers (`role="timer"`).
- Status never by colour alone: word + style.
- Focus visible on everything interactive; targets ≥ 44px; respects `prefers-reduced-motion`.

## Testing

- `__tests__/index.test.tsx` for every page shell and section.
- React Testing Library; query by role and text, not test id; `userEvent` for interaction; mock `t` as `(k) => k`.
- Shells: mock `container.resolve` and assert props reach the sections.

## Anti-patterns

- ❌ `'use client'` or logic in a route file
- ❌ Hooks or conditions in a page shell
- ❌ `useTranslation()` or `container.resolve()` in a section
- ❌ Tailwind classes in JSX, missing `.module.css`, missing `@reference`
- ❌ Direct imports from `@core/` or `@infrastructure/`
- ❌ `React.FC`, `forwardRef`, named component exports
- ❌ `div` buttons, images without `alt`/size, barrel `index.ts` re-exports
