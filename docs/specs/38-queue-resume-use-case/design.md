# Design Document

## Components and Interfaces

```ts
export type JoinQueueResult =
  | { kind: 'joined'; place: JoinedPlace; resumed: boolean }
  | { kind: 'sold-out' }
  | { kind: 'not-found' }
  | { kind: 'elsewhere' }
  /** 410 MISSED or EXPIRED on resume: show "Giliran terlewat" again, not a silent new number. */
  | { kind: 'missed' };

export interface JoinQueueUseCaseInterface {
  execute: (eventId: string, options?: { rejoin?: boolean }) => Promise<JoinQueueResult>;
}
```

## Layer Constraints

From `.claude/rules/core-use-case.md`:

- Return **typed discriminated unions**; never throw for an expected business outcome
- Catch only the specific `HttpError` codes you classify; re-throw everything else for the controller.

## Testing Strategy

Resume with both tokens; join without them, after 401/404, and on rejoin; every 410 code; errors propagate; the mock
keeps the place for a second "tab" (fresh handlers, same storage), draws at opening through `me`.
