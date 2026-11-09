# Requirements Document

## Introduction

NFR-07-W2 (sign in / sign up, PRD A-1, A-2, A-3, ADR-0006): wraps the `auth` operations (`requestOtp`, `verifyOtp`,
`refreshSession`, `logout`) and the two account operations the flow needs (`getMe`, `updateAuthProfile`). The
contract is the Apidog project "Rusuh Booking Tiket API" (newer than `rusuh-documentation/api/openapi.yaml` 0.3.0:
`WRONG_CODE` is 409, `consentVersion` is optional, the profile is saved with `PUT /auth/profile`). All auth calls
carry the device token from FR-04.

## Glossary

| Term          | Definition                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Challenge     | `requestOtp` answer: `challengeId`, `expiresAt` (10 min), `resendAfterSeconds` (60)                         |
| Session       | `verifyOtp` / `refreshSession` answer: `accessToken` (15 min), `expiresIn`, `isNewAccount`, `user`          |
| Access token  | Bearer JWT; kept in memory only (`tokenStore`), never in storage                                            |
| Refresh token | Web: `__Host-rt` cookie set by the API (HttpOnly), so the auth calls are sent with credentials              |
| Gate          | `requestOtp` needs one of `X-Turnstile-Token`, `X-Queue-Token` (in the waiting room) or `X-Admission-Token` |

## Requirements

### Requirement 1: Auth service

#### Acceptance Criteria

- `authService.requestOtp(body, deviceToken, gate)` SHALL `POST auth/otp` with `{ email, locale }`, `X-Device-Token`
  and exactly one gate header
- `authService.verifyOtp(body, deviceToken)` SHALL `POST auth/otp/verify` with `{ challengeId, code }`
- `authService.refreshSession(deviceToken)` SHALL `POST auth/refresh` with no body; `authService.logout()` SHALL
  `POST auth/logout`
- `verifyOtp`, `refreshSession` and `logout` SHALL be sent with credentials (the refresh cookie)
- Auth calls SHALL NOT trigger the adapter's refresh-on-401 (a 401 there is a device or session answer, not an
  expired access token)

### Requirement 2: Account service

#### Acceptance Criteria

- `accountService.getMe()` SHALL `GET me`; `accountService.updateProfile({ fullName, locale })` SHALL
  `PUT auth/profile`
- Services SHALL return `HttpResponse<T>` and let errors through

### Requirement 3: HTTP adapter

#### Acceptance Criteria

- `RequestConfig` SHALL accept `withCredentials` and `skipRefresh`; the adapter SHALL pass `withCredentials` to the
  request and SHALL NOT call `refreshSession` for a request marked `skipRefresh`
