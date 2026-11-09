# Design Document

## Overview

`core/use_case/device/with-device-token.ts` (shared helper), and three use cases in `core/use_case/auth/`. The
`coreHttp` registration resolves `refreshSessionUseCase` lazily at call time (infrastructure is registered before
the use cases) and keeps one in-flight refresh.

## Components and Interfaces

```ts
withDeviceToken<T>(deps: { deviceService; deviceTokenStore; turnstile }, call: (deviceToken) => Promise<T>): Promise<T>

type RequestSignInCodeResult =
  | { kind: 'sent'; challengeId: string; email: string; expiresAt: string; resendAfterSeconds: number }
  | { kind: 'rate-limited'; retryAfterSeconds: number | null }
  | { kind: 'invalid-email' };

type VerifySignInCodeResult =
  | { kind: 'signed-in'; isNewAccount: boolean; user: User }
  | { kind: 'wrong-code'; attemptsLeft: number }
  | { kind: 'expired' }
  | { kind: 'locked' };

RequestSignInCodeUseCase({ authService, deviceService, deviceTokenStore, queuePlaceStore, turnstile })
  .execute({ email, locale, eventId? }) → Promise<RequestSignInCodeResult>
VerifySignInCodeUseCase({ authService, deviceService, deviceTokenStore, turnstile, tokenStore })
  .execute({ challengeId, code }) → Promise<VerifySignInCodeResult>
RefreshSessionUseCase({ authService, deviceTokenStore, tokenStore })
  .execute() → Promise<boolean>
```

## Layer Constraints

- Depend only on services, config and other use cases from `AwilixRegistry`; zero React, Next.js, hooks, browser APIs.
- Return typed discriminated unions; never throw for an expected business outcome.
- Catch only the specific `HttpError` codes you classify; re-throw everything else for the controller.
- Return codes, never sentences. Stateless; no module-level mutable state.

## Correctness Properties

- Property 1: the access token is only ever written by a successful verify or refresh, and cleared by a failed
  refresh. **Validates: Requirements 3, 4**
- Property 2: `requestOtp` never sends both a queue token and a Turnstile token. **Validates: Requirements 2**

## Error Handling

| Code                                      | Outcome                                  |
| ----------------------------------------- | ---------------------------------------- |
| `RATE_LIMITED`, `TOO_MANY_REQUESTS` (429) | `rate-limited` (`retryAfterSeconds`)     |
| `VALIDATION_FAILED`, `BAD_REQUEST` (400)  | `invalid-email`                          |
| `WRONG_CODE` (409)                        | `wrong-code` (`attemptsLeft`, default 0) |
| `CHALLENGE_EXPIRED` (410)                 | `expired`                                |
| `CHALLENGE_LOCKED` (410)                  | `locked`                                 |
| `UNAUTHORIZED` on a stored device token   | re-register once, then retry             |
| anything else                             | thrown to the controller                 |

## Testing Strategy

Plain mocks for every branch, plus one test per use case that an unclassified error propagates; the join-queue tests
stay green after the helper is extracted.
