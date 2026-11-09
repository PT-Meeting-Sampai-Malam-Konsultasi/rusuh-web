# Requirements Document

## Introduction

The join flow as one use case: make sure the browser has a device token, join with a fresh Turnstile token, recover
once from a rejected device token, keep the place for later calls, and classify the expected answers.

## Requirements

### Requirement 1: Device token

#### Acceptance Criteria

- WHEN no device token is stored THEN SHALL get a Turnstile token (action `register`), call `registerDevice` and store
  the token
- WHEN `joinQueue` answers 401 `UNAUTHORIZED` THEN SHALL clear the device token, register again and join once more;
  a second 401 SHALL propagate

### Requirement 2: Join and keep the place

#### Acceptance Criteria

- SHALL join with a fresh Turnstile token (action `join`)
- WHEN joined THEN SHALL store `{ queueToken, seq, joinedServed }`; `joinedServed` is the first `served` seen for this
  `seq` (kept across rejoins), used as "Saat Anda bergabung" on the progress track
- SHALL return `{ kind: 'joined', place }` with `state`, `seq`, `served`, `joinedServed`, `opensAt`, `turnExpiresAt`,
  `serverNow`

### Requirement 3: Expected outcomes

#### Acceptance Criteria

- 410 `QUEUE_CLOSED` → `{ kind: 'sold-out' }` and the stored place is removed
- 404 `NOT_FOUND` → `{ kind: 'not-found' }`
- 409 `ACCOUNT_HAS_PLACE_ELSEWHERE` → `{ kind: 'elsewhere' }`
- Anything else (429, 503, network, Turnstile failure) SHALL propagate for the controller to show with a retry
