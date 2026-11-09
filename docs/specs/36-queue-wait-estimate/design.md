# Design Document

## Components and Interfaces

`src/core/use_case/queue/wait-estimate.ts` (pure, like `place.ts`):

```ts
export type WaitEstimate = { kind: 'range'; low: number; high: number } | { kind: 'soon' };

/** Null: no estimate (paused, no rate yet, no number). */
export function waitEstimate(position: number | null, rateLow?: number, rateHigh?: number): WaitEstimate | null;

/** The range to show now, given the one shown before: it only goes up on a real slowdown (> 30%). */
export function holdWaitEstimate(shown: WaitEstimate | null, next: WaitEstimate | null): WaitEstimate | null;
```

## Layer Constraints

From `.claude/rules/core-use-case.md`:

- queue position and ETA from the frontier (`seq − served`, rate, rounded range — `08-eta-estimation`)
- Zero React, zero Next.js, zero hooks, zero browser APIs

## Correctness Properties

- Property 1: `low ≤ high`, both whole minutes on the step grid. **Validates: Requirements 1**
- Property 2: the shown high end never rises by 30% or less. **Validates: Requirements 2**

## Testing Strategy

The document's example (1.560 at 270/360 → 4–6), each step size, `soon`, no rate, and the hold rules.
