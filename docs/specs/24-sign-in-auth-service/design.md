# Design Document

## Overview

Entities in `core/entities/auth`, `AuthService` and `AccountService` on `coreHttp`, two new `RequestConfig` flags in
the HTTP protocol and adapter. Nothing here decides anything: the use cases (spec 25) pick the gate and classify
the answers.

## Components and Interfaces

```ts
// core/entities/auth/auth.entity.ts
interface User { userId: string; email: string; fullName?: string; locale?: 'id' | 'en' }
interface Session { accessToken: string; expiresIn: number; refreshToken?: string; isNewAccount: boolean; user: User }
interface RequestOtpRequest { email: string; locale: 'id' | 'en' }
interface OtpChallenge { challengeId: string; expiresAt: string; resendAfterSeconds: number }
interface VerifyOtpRequest { challengeId: string; code: string }
interface UpdateProfileRequest { fullName: string; locale?: 'id' | 'en' }
type OtpGate = { turnstileToken: string } | { queueToken: string } | { admissionToken: string };

AuthService({ coreHttp })
  .requestOtp(body, deviceToken, gate) → HttpResponse<OtpChallenge>
  .verifyOtp(body, deviceToken)        → HttpResponse<Session>
  .refreshSession(deviceToken)         → HttpResponse<Session>
  .logout()                            → HttpResponse<void>
AccountService({ coreHttp })
  .getMe()                             → HttpResponse<User>
  .updateProfile(body)                 → HttpResponse<User>

RequestConfig { headers?; signal?; withCredentials?: boolean; skipRefresh?: boolean }
```

`requestOtp` sends no `fullName`: the name is asked after the code, on the profile step, and saved with
`updateProfile` (the real auth service keeps `fullName` optional on `requestOtp`). No NIK on the account (D17).

## Layer Constraints

- `src/core/` is pure TypeScript. No React, no Next.js, no Axios, no browser APIs, no infrastructure imports.
- Protocols: pure interfaces with zero imports.
- Services: one aggregate per file, return `HttpResponse<T>`, no transformation, no error catching.
- Adapters are the only place external libraries are imported; dependencies come through factory params.

## Correctness Properties

- Property 1: every auth call carries `X-Device-Token`; `requestOtp` carries exactly one gate header.
  **Validates: Requirements 1**
- Property 2: a `skipRefresh` request that answers 401 rejects at once, without calling `refreshSession`.
  **Validates: Requirements 3**

## Error Handling

Services let `HttpError` through (`WRONG_CODE` 409 with `attemptsLeft`, `CHALLENGE_EXPIRED` / `CHALLENGE_LOCKED`
410, `RATE_LIMITED` 429, `VALIDATION_FAILED` 400, `UNAUTHORIZED` 401).

## Testing Strategy

Service tests with a mocked `coreHttp` (method, path, body, headers, flags); adapter tests for `withCredentials` and
`skipRefresh`.
