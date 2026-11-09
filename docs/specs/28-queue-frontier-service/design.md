# Design Document

## Overview

Types plus one GET, and the mock endpoints. The stream itself is read by the existing `queueStream` adapter
(fetch-based SSE, `src/infrastructure/adapters/queue-stream.adapter.ts`), which already parses `frontier` and `turn`.

## Architecture

```
queueService.getFrontier ── queueHttp ── GET /queue/{eventId}/frontier   (public, CDN 1 s)
queueStream.open         ── fetch     ── GET /queue/{eventId}/stream     (X-Device-Token, X-Queue-Token)
```

## Components and Interfaces

```ts
export interface QueueServiceInterface {
  joinQueue: (eventId: string, deviceToken: string, turnstileToken: string) => Promise<HttpResponse<QueuePlace>>;
  /** `GET /queue/{eventId}/frontier`: public snapshot for polling (ADR-0003). 404 NOT_FOUND. */
  getFrontier: (eventId: string) => Promise<HttpResponse<Frontier>>;
}
```

## Data Models

```ts
export type QueuePauseReason = 'stock' | 'operator' | 'sold_out' | 'cancelled' | 'ended';

export interface Frontier {
  event: string;
  state: QueueState;
  served: number;
  sellable?: number;
  reserved?: number;
  held?: number;
  ratePerMin?: number;
  rateLow?: number;
  rateHigh?: number;
  rateSource?: 'prior' | 'measured';
  streamFrom?: number;
  reason?: QueuePauseReason;
  /** Unix seconds. */
  opensAt?: number;
  /** Server time of the snapshot, Unix seconds. */
  ts: number;
}

export interface QueueTurn {
  event: string;
  seq: number;
  served: number;
  turnExpiresAt: string;
  serverNow: string;
}
```

## Layer Constraints

From `.claude/rules/core-service.md`:

- Types only: request (`…Request`), response (`…Response`), domain models (plain names). No classes, no runtime code.
- Optional fields (`?`) only where the contract makes them optional.
- Depend only on `http` (and `config`) from `AwilixRegistry`.
- Always return `HttpResponse<T>`.
- No transformation (that is a use case), no try/catch: let `HttpError` propagate.

## Correctness Properties

- Property 1: `getFrontier` sends no token headers. **Validates: Requirements 2**
- Property 2: the mock's `served` is the same for `joinQueue` and `getFrontier` at the same instant, and never passes
  the newest number handed out. **Validates: Requirements 3**

## Error Handling

| Code                                | Status       | Seen by                                                 |
| ----------------------------------- | ------------ | ------------------------------------------------------- |
| `NOT_FOUND`                         | 404          | use case (`not-found`)                                  |
| `TOO_FAR`                           | 409 (stream) | adapter → `connect_failed`, keep polling                |
| `QUEUE_CLOSED`, `MISSED`, `EXPIRED` | 410 (stream) | adapter → `connect_failed`; polling then shows `closed` |
| `STREAM_FULL`                       | 503 (stream) | adapter → `connect_failed`, keep polling                |

## Testing Strategy

- `queue.service.test.ts`: URL, method, no token headers.
- `queue.handlers.test.ts` (MSW node): frontier matches the join's `served`; paused reason; `stream_off`; stream
  sends `retry`, a first `frontier` and a `turn` at the front; 409 `TOO_FAR` far back; 401 without tokens.
