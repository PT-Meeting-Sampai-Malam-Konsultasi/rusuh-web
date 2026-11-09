# Requirements Document

## Introduction

The sign-in business logic (ADR-0006, PRD A-1–A-3): get a code for an e-mail, check the code, and keep the session
alive. Each step needs the device token from FR-04, so the device handling of `joinQueueUseCase` moves into a shared
helper used by both.

## Glossary

| Term    | Definition                                                                                  |
| ------- | ------------------------------------------------------------------------------------------- |
| Gate    | Proof for `requestOtp`: the stored queue token for the event, otherwise a Turnstile token   |
| Outcome | Discriminated union returned by a use case; expected API errors become outcomes, not throws |

## Requirements

### Requirement 1: Device token helper

#### Acceptance Criteria

- SHALL use the stored device token, or register one (Turnstile + `registerDevice`) and store it
- WHEN a stored device token is rejected with `UNAUTHORIZED` THEN SHALL clear it, register a new one and retry once;
  a token registered in the same call SHALL NOT be retried
- `joinQueueUseCase` SHALL use the helper with unchanged behaviour

### Requirement 2: Request a code

#### Acceptance Criteria

- `requestSignInCodeUseCase.execute({ email, locale, eventId? })` SHALL trim and lower-case the e-mail, send the
  queue token stored for `eventId` when there is one, otherwise a fresh Turnstile token (action `otp`)
- SHALL return `sent` with `challengeId`, `email`, `expiresAt`, `resendAfterSeconds`
- `RATE_LIMITED` (or the auth service's `TOO_MANY_REQUESTS`) SHALL return `rate-limited` with `retryAfterSeconds`
  when the problem carries one; `VALIDATION_FAILED` (or `BAD_REQUEST`) SHALL return `invalid-email`
- Other errors SHALL propagate

### Requirement 3: Verify the code

#### Acceptance Criteria

- `verifySignInCodeUseCase.execute({ challengeId, code })` SHALL keep the access token in `tokenStore` and return
  `signed-in` with `isNewAccount` and `user`
- `WRONG_CODE` SHALL return `wrong-code` with `attemptsLeft`; `CHALLENGE_EXPIRED` → `expired`;
  `CHALLENGE_LOCKED` → `locked`; other errors SHALL propagate

### Requirement 4: Refresh the session

#### Acceptance Criteria

- `refreshSessionUseCase.execute()` SHALL resolve `true` and keep the new access token when `refreshSession`
  answers; WHEN there is no device token or the refresh fails THEN SHALL clear the access token and resolve `false`
- The `coreHttp` adapter SHALL call it on a 401, with concurrent 401s sharing one refresh
