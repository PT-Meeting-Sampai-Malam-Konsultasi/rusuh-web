# Design Document

## Components and Interfaces

```ts
export interface Admission {
  admissionToken: string;
  slotId: string;
  /** 1–3 (ADR-0024). */
  maxTickets: number;
  /** End of the 16-minute admission TTL (ADR-0021). */
  expiresAt: string;
  serverNow: string;
}

export interface QueueServiceInterface {
  // …joinQueue, getFrontier
  claimTurn: (eventId: string, deviceToken: string, queueToken: string) => Promise<HttpResponse<Admission>>;
  getMyPlace: (eventId: string, deviceToken: string, queueToken: string) => Promise<HttpResponse<QueuePlace>>;
}
```

## Layer Constraints

From `.claude/rules/core-service.md`:

- Depend only on `http` (and `config`) from `AwilixRegistry`.
- Always return `HttpResponse<T>`.
- No transformation (that is a use case), no try/catch: let `HttpError` propagate.

## Error Handling

| Code                         | Status | Meaning                                     |
| ---------------------------- | ------ | ------------------------------------------- |
| `UNAUTHORIZED`               | 401    | No session (guest): sign in first           |
| `NOT_YET`, `FULL`            | 409    | Retry after 1 s (`FULL`: 1–2 s with jitter) |
| `NO_STOCK`                   | 409    | Queue paused: back to waiting               |
| `MISSED`, `EXPIRED`, `MOVED` | 410    | Place gone: queue again                     |
| `QUEUE_CLOSED`               | 410    | Sold out                                    |

## Testing Strategy

Service URLs and headers; mock: claim before, at and after the window, without a session, repeat; `me` turn window;
join after a missed turn gives a new number.
