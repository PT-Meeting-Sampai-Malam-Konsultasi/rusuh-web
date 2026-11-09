# Design Document

## Components and Interfaces

```ts
export interface QueueWaitingView {
  // …
  /** "± 4–6 menit lagi", or null when there is no estimate (no rate yet). */
  eta: string | null;
}
```

## Layer Constraints

From `.claude/rules/controller.md`:

- Return only what the screen needs, already translated or formatted.

From `.claude/rules/presentation.md`:

- Live regions: the queue number and ETA (`aria-live="polite"`), field errors (`role="alert"`), timers (`role="timer"`).

## Testing Strategy

Controller: range, single, soon, none at rate 0, held across a small rise, reset for a new number. Screen: the row
with and without an estimate.
