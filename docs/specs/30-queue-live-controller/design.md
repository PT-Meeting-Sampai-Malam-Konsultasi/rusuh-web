# Design Document

> **Updated 13 Nov 2026:** SSE is dropped; the waiting room follows the queue by polling the frontier only. The stream
> effect, `queue_stream` analytics and the `fellBack` state were removed; the frontier query polls at every position.

## Overview

Adds a frontier query, a stream effect and the live place to `queue.controller.ts`. No new route.

## Architecture

```
joinQuery ─ JoinedPlace ─┐
frontierQuery ───────────┼─ applyFrontier ─ LivePlace ─ queueStatusFor ─ views
stream (setQueryData) ───┘
```

## Components and Interfaces

```ts
export interface QueueWaitingView {
  position: string;
  progress: number;
  served: string;
  seq: string;
  /** "Diperbarui 3 detik lalu". */
  updated: string;
  /** "300 orang masuk / menit", or null when there is no rate yet. */
  rate: string | null;
}
```

New deps: `followQueueUseCase`, `useQueryClientTanstack`. New query key `QUERY_KEYS.QUEUE_FRONTIER`.

## Layer Constraints

From `.claude/rules/controller.md`:

- Queries and mutations wrapping use cases or services (`useQueryTanstack`, `useMutationTanstack`)
- Timers derived from server time, polling intervals (`refetchInterval`), SSE subscriptions through a DI adapter
- Business rules, validation, data transformation → use case

## Correctness Properties

- Property 1: polling and a healthy stream never run together. **Validates: Requirements 1, 2**
- Property 2: the stream is closed on unmount. **Validates: Requirements 2**

## Error Handling

Poll errors and `not-found` keep the last place silently (the next tick retries). Stream failures fall back to
polling; nothing is shown to the buyer.

## Testing Strategy

`queue.controller.test.ts` with `renderHook` and fake timers: polling interval, frontier moves the position, paused
and closed from the frontier, stream opens near the front and stops polling, fallback resumes polling and retries,
turn stops both, `updated` ticks, `rate` null at 0.
