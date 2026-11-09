# Design Document

## Components and Interfaces

```ts
export type QueueStatus = … | 'turn' | 'missed';

export interface QueueTurnView {
  /** "19.700". */
  seq: string;
  /** Seconds left in the 60 s window, or null before the window is known. */
  seconds: number | null;
  /** True while the claim is on its way (signed in, page visible). */
  claiming: boolean;
  /** Guest: where "Masuk untuk lanjut" goes; null when signed in. */
  signInHref: string | null;
}

interface QueueControllerInterface {
  // …
  turn: QueueTurnView | null;
  claimNow: () => void;
  queueAgain: () => void;
}
```

New deps: `claimTurnUseCase`, `usePageVisible` (a hook over `visibilitychange`, registered in DI like the context
hooks), `useRouterNext`.

## Layer Constraints

From `.claude/rules/controller.md`:

- Queries and mutations wrapping use cases or services (`useQueryTanstack`, `useMutationTanstack`)
- Countdowns: compute from `expiresAt − serverNow` (plus elapsed client time since the response), never `Date.now()`
  against a deadline alone.

## Testing Strategy

Claim enabled only at the turn and when visible; navigation on admission; retry interval; sign-in link; countdown;
missed by answer and by 0; queue again; analytics.
