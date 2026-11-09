# Design Document

## Overview

`JoinQueueUseCase({ deviceService, queueService, deviceTokenStore, queuePlaceStore, turnstile })`. Besides services
it takes three protocols (pure interfaces, like the services' `HttpProtocol`), so it stays pure TypeScript and is
tested with plain mocks.

```ts
type JoinQueueResult =
  { kind: 'joined'; place: JoinedPlace } | { kind: 'sold-out' } | { kind: 'not-found' } | { kind: 'elsewhere' };
```

## Layer Constraints

- Return typed discriminated unions; never throw for an expected business outcome.
- Catch only the specific `HttpError` codes you classify; re-throw everything else for the controller.
- Return codes, never sentences. Stateless; `asFunction(UseCase).singleton()`.
- ❌ React or Next.js imports, navigation, analytics or translation calls, module-level mutable state.

## Correctness Properties

- Property 1: at most one re-registration per join. **Validates: Requirements 1**
- Property 2: `joinedServed` never moves for the same `seq`. **Validates: Requirements 2**

## Error Handling

Unclassified errors propagate unchanged.

## Testing Strategy

Every branch with plain mocks, including the 401 recovery and one propagated infrastructure error.
