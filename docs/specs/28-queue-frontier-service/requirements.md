# Requirements Document

## Introduction

Wraps the queue frontier for FR-07-W1 (rusuh-web#7, parent FR-07): `GET /queue/{eventId}/frontier` (`getFrontier`) and
the types of the `streamQueue` events, so the waiting room can update the position without joining again (PRD W-2,
ADR-0003, ADR-0015). The contract is Apidog (`Frontier`, `QueueTurn`). The mock API answers both, so the live updates
can be seen without a backend.

## Glossary

| Term     | Definition                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| Frontier | Public snapshot of a queue: `served`, `state`, admit rate, `streamFrom`, `reason`, `ts` (server Unix seconds) |
| Turn     | `seq ≤ served`: the device may claim (FR-08)                                                                  |
| Stream   | `GET /queue/{eventId}/stream`, Server-Sent Events for devices at or below `streamFrom`                        |

## Requirements

### Requirement 1: Frontier and turn types

**User Story:**

AS the waiting room
I WANT typed frontier and turn payloads
SO THAT the position, rate and pause reason come from one shape for polling and the stream

#### Acceptance Criteria

- SHALL add `Frontier` (required: `event`, `state`, `served`, `ts`; optional: `sellable`, `reserved`, `held`,
  `ratePerMin`, `rateLow`, `rateHigh`, `rateSource`, `streamFrom`, `reason`, `opensAt`) and `QueueTurn` (`event`,
  `seq`, `served`, `turnExpiresAt`, `serverNow`) to `queue.entity.ts`, matching Apidog
- SHALL type `reason` as `'stock' | 'operator' | 'sold_out' | 'cancelled' | 'ended'`

### Requirement 2: getFrontier

**User Story:**

AS the waiting room
I WANT to read the frontier
SO THAT I can poll it every 2–10 s

#### Acceptance Criteria

- SHALL add `queueService.getFrontier(eventId)` → `GET queue/{eventId}/frontier` on `queueHttp`, no token headers
  (the frontier is public and cached 1 s at the CDN)
- SHALL return `HttpResponse<Frontier>` and let `HttpError` propagate (404 `NOT_FOUND`)

### Requirement 3: Mock frontier and stream

**User Story:**

AS QA
I WANT the mock API to move the queue and stream it near the front
SO THAT polling, streaming, pause and the turn can be seen without a backend

#### Acceptance Criteria

- SHALL serve one `served` per event from a per-event clock (5 people per second from the first join), shared by
  `joinQueue` and `getFrontier`, and kept for the tab like the places
- SHALL answer `getFrontier` with `state`, `served`, `ratePerMin` 300, `rateLow` 240, `rateHigh` 360, `rateSource`
  `measured`, `streamFrom` 2000 and `ts`; `paused` with `reason: 'stock'` for a temporarily full event
- WHEN the scenario is `stream_off` THEN SHALL answer `streamFrom: 0` and refuse the stream with 409 `TOO_FAR`
- SHALL serve `streamQueue` as `text/event-stream`: `retry: 3000`, a `frontier` event at once and every second, and
  a `turn` event once `seq ≤ served`; 409 `TOO_FAR` when the device is further back than `streamFrom`; 401 without
  the device or queue token
