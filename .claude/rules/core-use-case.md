---
paths:
  - "src/core/use_case/**"
---

# Core: use cases

Use cases are the business logic of the app. They are pure TypeScript and fully testable with plain mocks.

## Position

- `src/core/use_case/{domain}/{action}.use-case.ts`
- Depend only on services, config and other use cases from `AwilixRegistry`
- Zero React, zero Next.js, zero hooks, zero browser APIs

## What belongs here

- Multi-step orchestration (check → validate → transform → decide)
- Business rules and validation, for example:
  - queue position and ETA from the frontier (`seq − served`, rate, rounded range — `08-eta-estimation`)
  - remaining time from `expiresAt − serverNow`
  - order limits: total tickets ≤ `min(maxTicketsPerOrder, reservedUnits)`; one NIK per ticket, all different
  - "Myself" may be used on one ticket only (1 NIK = 1 seat per event)
  - mapping booking/payment status to the next screen
- Transforming API responses into domain models
- Classifying expected API errors into business outcomes

## What does not belong

- React state, TanStack Query, navigation, analytics, `t()`, user-facing strings, loading overlays, popups

## Rules

- Return **typed discriminated unions**; never throw for an expected business outcome:

  ```ts
  type ValidateAttendeeResult =
    | { kind: 'valid'; validationToken: string; nikMasked: string }
    | { kind: 'invalid'; reason: 'NIK_INVALID' | 'DUPLICATE_NIK' | 'NIK_SEAT_TAKEN' }
    | { kind: 'retry-later'; reason: 'RATE_LIMITED' | 'DUKCAPIL_UNAVAILABLE' };
  ```

- Catch only the specific `HttpError` codes you classify; re-throw everything else for the controller.
- Return codes, never sentences: the controller maps codes to translation keys.
- Stateless; registered as `asFunction(UseCase).singleton()`; interface added to `AwilixRegistry`.

## When to create one

| Scenario | Use case? |
| --- | --- |
| Simple GET, no transformation | No — controller wraps the service in `useQuery` |
| Simple POST, no branching | No — controller wraps the service in `useMutation` |
| Multi-step flow, business validation, branching on status | Yes |
| Aggregating or transforming data from several services | Yes |

## Testing

- `src/core/use_case/{domain}/__tests__/{action}.use-case.test.ts`
- Plain object mocks, every business branch, and one test that infrastructure errors propagate.
- Coverage threshold 85%.

## Anti-patterns

- ❌ React or Next.js imports
- ❌ User-facing strings
- ❌ Catching all errors
- ❌ Navigation, analytics or translation calls
- ❌ Module-level mutable state
- ❌ A use case that only forwards one service call
- ❌ Throwing for an expected outcome
