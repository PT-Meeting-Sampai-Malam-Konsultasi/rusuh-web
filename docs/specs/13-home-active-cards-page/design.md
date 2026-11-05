# Design Document

## Overview

A shared `ButtonLink` (a link styled exactly like `Button`, reusing its module) for the hero; `EventCard` turns into
an active card with a stretched link when `event.join` is set.

## Components and Interfaces

```ts
ButtonLink({ href, variant?, size?, onClick?, children })   // next/link, prefetch off
HomeHero({ t, event, joinHint, onSelect })
EventCard({ event, index, onSelect })
EventList({ t, events, countLabel, isMainHeading, onSelect })
```

## Layer Constraints

- Receive all data and callbacks as props, including `t`. Never call `useTranslation()` or `container.resolve()`.
- Semantic HTML: `main`, `section`, `h1`…, `button` for actions (never `div onClick`), `form` with labels.
- Interactive elements define `:hover`, `:focus-visible`, `:disabled` and pressed states.
- **No Tailwind class strings in JSX**, no inline `style` except CSS variables for dynamic values

## Correctness Properties

- Property 1: one link per active card (no nested interactive elements). **Validates: Requirements 2**

## Error Handling

None.

## Testing Strategy

Component tests for `ButtonLink`, the hero CTA, active and plain cards, and the `onSelect` calls; browser check at
390 and 1440 with the mock.
