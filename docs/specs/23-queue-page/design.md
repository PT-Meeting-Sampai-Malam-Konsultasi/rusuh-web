# Design Document

## Overview

`QueueScreen` resolves `queueController` and renders `AppHeader`, `QueueEvent` (poster aside / phone banner),
one of `QueueWaiting`, `QueuePrequeue`, `QueuePaused`, `QueueSoldOut`, `QueueJoining` or `QueueMessage`, the notes,
`AppFooter` and `TabBar`. Route `src/app/queue/page.tsx` wraps it in `<Suspense>` with the joining view.

## Layer Constraints

- Receive all data and callbacks as props, including `t`. Never call `useTranslation()` or `container.resolve()`
  (except the screen, which resolves its controller).
- Semantic HTML; interactive elements define hover, focus-visible and pressed states.
- **No Tailwind class strings in JSX**, no inline `style` except CSS variables for dynamic values.

## Correctness Properties

- Property 1: exactly one `h1` in the accessibility tree at any width. **Validates: Requirements 1**

## Error Handling

Messages come translated from the controller.

## Testing Strategy

Component tests per view; browser check at 390 and 1440, ID and EN, with the mock (Pelita waiting, Samudra
pre-queue, Rimba paused, Deru sold out, unknown id, no id).
