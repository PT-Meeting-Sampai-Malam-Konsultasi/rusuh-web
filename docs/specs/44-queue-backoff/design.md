# Design Document

> **Updated 13 Nov 2026:** SSE is dropped; the waiting room follows the queue by polling the frontier only.
> `pollDelayMs` lost its `fellBack` argument; the backoff itself is unchanged.

- `pollDelayMs(position, jitter, fellBack, failures = 0)`: `min(60 s, tier × 2^failures)` before the ±20% jitter.
- Controller: failures in a row = `errorUpdateCount` minus its value at the last success (kept in a ref, updated in
  `refetchInterval`); the jitter comes from the newest answer's arrival millisecond (success or failure).
- Claim query: `retry: 3`, `retryDelay: (n) => 1000 × 2^n`; `claiming` is false once the query is in error.

## Layer Constraints

From `.claude/rules/core-use-case.md`: queue position and ETA from the frontier … — the interval rule stays with the
other polling rules in `follow-queue.use-case.ts`.

From `.claude/rules/controller.md`: Timers derived from server time, polling intervals (`refetchInterval`).

## Testing Strategy

`pollDelayMs` doubling and cap; controller interval after failures and after a success; claim retry options and the
button after a failed claim; browser: 503s for 45 s.
