# Design Document

## Overview

View-model changes only (`src/utils`): a `QUEUE_ANYWAY_STATES` constant, a `kind` on `EventCardView.join`, and an
`overlay` word for sold-out posters. The controller already maps every event through `toEventCardView` and tracks
`selectEvent` with the card's state, so it does not change.

## Components and Interfaces

```ts
export const QUEUE_ANYWAY_STATES: readonly EventState[] = ['temporarily_full'];

interface EventCardView {
  // …
  join: { href: string; label: string; kind: 'join' | 'anyway' } | null;
  /** Word stamped across a sold-out poster ("HABIS"); null otherwise. */
  overlay: string | null;
}
```

## Layer Constraints

- Utils are pure functions: no React, no `container.resolve()`, translated strings come from the `t` passed in.
- Every string a component shows is already translated in the view model.

## Correctness Properties

- Property 1: `join` is set exactly for joinable and temporarily full states. **Validates: Requirements 1**
- Property 2: `overlay` is set exactly for `sold_out`. **Validates: Requirements 2**

## Error Handling

None.

## Testing Strategy

Unit tests in `event-card.test.ts` for every state.
