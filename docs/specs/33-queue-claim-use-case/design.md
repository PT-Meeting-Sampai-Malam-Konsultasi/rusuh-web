# Design Document

## Components and Interfaces

```ts
export type ClaimTurnResult =
  | { kind: 'admitted'; admission: Admission }
  | { kind: 'sign-in' }
  | { kind: 'retry'; afterMs: number }
  | { kind: 'paused' }
  | { kind: 'missed' }
  | { kind: 'sold-out' };

export type TurnWindowResult =
  | { kind: 'window'; turnExpiresAt: string; serverNow: string }
  | { kind: 'waiting' }
  | { kind: 'missed' }
  | { kind: 'sold-out' };

export interface ClaimTurnUseCaseInterface {
  execute: (eventId: string, random?: number) => Promise<ClaimTurnResult>;
  turnWindow: (eventId: string) => Promise<TurnWindowResult>;
}
```

Deps: `queueService`, `deviceTokenStore`, `queuePlaceStore`, `admissionStore`.

## Layer Constraints

From `.claude/rules/core-use-case.md`:

- Return **typed discriminated unions**; never throw for an expected business outcome
- Catch only the specific `HttpError` codes you classify; re-throw everything else for the controller.
- Stateless; registered as `asFunction(UseCase).singleton()`; interface added to `AwilixRegistry`.

## Testing Strategy

Every outcome of both methods, the stored admission, the forgotten place, missing tokens, error propagation.
