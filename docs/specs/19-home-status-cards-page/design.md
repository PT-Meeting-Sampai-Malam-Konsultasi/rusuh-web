# Design Document

## Overview

`EventCard` gets three looks: active (FR-02, stretched link), queue anyway (secondary `ButtonLink`, `sm`) and
finished (dimmed poster, optional overlay plate, muted title). `HomeHero` picks the button variant from
`join.kind`. `ButtonLink` gains an optional `ariaLabel`.

## Components and Interfaces

```ts
ButtonLink({ href, variant?, size?, fullWidth?, className?, ariaLabel?, onClick?, children })
EventCard({ event, index, onSelect })        // reads event.join.kind, event.finished, event.overlay
HomeHero({ t, event, joinHint, onSelect })   // primary for 'join', secondary for 'anyway'
```

## Layer Constraints

- Receive all data and callbacks as props, including `t`. Never call `useTranslation()` or `container.resolve()`.
- Semantic HTML: `main`, `section`, `h1`…, `button` for actions (never `div onClick`), `form` with labels.
- Interactive elements define `:hover`, `:focus-visible`, `:disabled` and pressed states.
- **No Tailwind class strings in JSX**, no inline `style` except CSS variables for dynamic values

## Correctness Properties

- Property 1: finished cards contain no interactive element. **Validates: Requirements 1**
- Property 2: a queue-anyway card has exactly one link, the button. **Validates: Requirements 2**

## Error Handling

None.

## Testing Strategy

Component tests for the three card looks and the hero's two button variants; browser check at 390 and 1440, ID
and EN, with the mock (Rimba temporarily full, Deru sold out, Kelana ended).
