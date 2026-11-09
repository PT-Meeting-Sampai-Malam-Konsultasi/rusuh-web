# Design Document

## Overview

One use case, `followQueueUseCase` (`src/core/use_case/queue/follow-queue.use-case.ts`), with `poll` and `stream`,
plus pure exported rules (`applyFrontier`, `pollDelayMs`, `canStream`, `streamRetryDelayMs`). Position and progress
move from `join-queue.use-case.ts` into `src/core/use_case/queue/place.ts`, shared by both.

## Architecture

```
controller ─ useQuery(refetchInterval = pollDelayMs) ─ followQueueUseCase.poll ─ queueService.getFrontier
controller ─ effect ─ followQueueUseCase.stream ─ queueStream.open (tokens from deviceTokenStore, queuePlaceStore)
controller ─ applyFrontier(joinedPlace, newest frontier) ─ live place
```

## Components and Interfaces

```ts
export type FrontierResult = { kind: 'frontier'; frontier: Frontier } | { kind: 'not-found' };

export interface FollowQueueHandlers {
  onFrontier(frontier: Frontier): void;
  onTurn(turn: QueueTurn): void;
  onFallback(reason: QueueStreamFallbackReason): void;
  onClose(): void;
}

export interface FollowQueueUseCaseInterface {
  poll: (eventId: string) => Promise<FrontierResult>;
  /** Null when this device has no device or queue token for the event. Returns the close function. */
  stream: (eventId: string, handlers: FollowQueueHandlers) => (() => void) | null;
}

export interface LivePlace extends JoinedPlace {
  turnReached: boolean;
}

export function applyFrontier(place: JoinedPlace, frontier: Frontier | null): LivePlace;
export function pollDelayMs(position: number | null, random: number, fellBack: boolean): number;
export function canStream(position: number | null, streamFrom: number | undefined): boolean;
export function streamRetryDelayMs(event: QueueStreamFallbackReason | 'closed', connectFailuresInRow: number): number;
```

## Data Models

`Frontier`, `QueueTurn` (spec 28); `JoinedPlace` (join use case).

## Layer Constraints

From `.claude/rules/core-use-case.md`:

- Depend only on services, config and other use cases from `AwilixRegistry`
- Zero React, zero Next.js, zero hooks, zero browser APIs
- Return **typed discriminated unions**; never throw for an expected business outcome
- Catch only the specific `HttpError` codes you classify; re-throw everything else for the controller.
- Return codes, never sentences: the controller maps codes to translation keys.
- Stateless; registered as `asFunction(UseCase).singleton()`; interface added to `AwilixRegistry`.

`queueStream`, `deviceTokenStore` and `queuePlaceStore` are protocols in `AwilixRegistry`, as for the join.

## Correctness Properties

- Property 1: `served` never decreases through `applyFrontier`. **Validates: Requirements 1**
- Property 2: `pollDelayMs` is within ±20% of its tier, and ≤ 2,400 ms when `fellBack`. **Validates: Requirements 2**
- Property 3: no stream without both tokens. **Validates: Requirements 3**

## Error Handling

| Code            | Result                                                        |
| --------------- | ------------------------------------------------------------- |
| 404 `NOT_FOUND` | `{ kind: 'not-found' }` (the controller keeps the last place) |
| anything else   | propagates; the controller keeps polling on the next tick     |

## Testing Strategy

`follow-queue.use-case.test.ts`: every tier and the jitter bounds, `canStream` edges, `applyFrontier` (served never
back, preopen kept, paused/closed, turn), retry delays, poll outcomes and error propagation, stream token checks and
payload parsing. `join-queue.use-case.test.ts` stays green after the move.
