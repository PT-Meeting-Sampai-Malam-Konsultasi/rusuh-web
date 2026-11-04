# Design Document

## Overview

Route `src/app/page.tsx` → `HomeScreen` shell → sections `HomeHero`, `EventList` (+ `EventCard`), `HomeSkeleton`,
`HomeMessage`; shared chrome `AppHeader`, `AppFooter`, `TabBar`, `LanguageSwitch` and `Poster` in
`src/presentation/components/`.

## Components and Interfaces

```ts
HomeHero({ t, event: EventCardView })
EventList({ t, events: EventCardView[], countLabel: string })
EventCard({ event: EventCardView, index: number })
HomeSkeleton({ label: string })
HomeMessage({ title, body, actionLabel?, onAction? })
Poster({ tone, kicker?, title, subtitle?, imageUrl?, size: 'hero' | 'card', meta? })
AppHeader({ t, nav, locale, onLocaleChange })
TabBar({ label, nav })
AppFooter({ t })
LanguageSwitch({ label, locale, onChange })
```

## Layer Constraints

- Zero hooks and zero logic of their own: `container.resolve<Interface>('xController')` at the top of render, then pass
  props to sections.
- Receive all data and callbacks as props, including `t`. Never call `useTranslation()` or `container.resolve()`.
- **No Tailwind class strings in JSX**, no inline `style` except CSS variables for dynamic values
- First line of every module: `@reference "<relative path>/styles/app.css";`
- Mobile first: base styles target the phone (390), then `@variant md` / `lg` (or `@media (width >= …)`) for wider.
- Interactive elements define `:hover`, `:focus-visible`, `:disabled` and pressed states.

## Correctness Properties

- Property 1: the shell renders exactly one of skeleton, message or content per `status`. **Validates: Requirements 2**

## Error Handling

Shown by `HomeMessage` from the controller's `errorMessage`.

## Testing Strategy

Shell test with a mocked container; one test per section and shared component; build gate.
