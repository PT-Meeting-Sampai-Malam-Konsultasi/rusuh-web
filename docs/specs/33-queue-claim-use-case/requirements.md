# Requirements Document

## Introduction

`claimTurnUseCase` for FR-08-W1: claims the turn and keeps the admission token for the order page, classifies every
claim answer, and reads the turn window (PRD W-5, App Flow 4.2 `turn` / `missed`).

## Requirements

### Requirement 1: Claim

#### Acceptance Criteria

- SHALL claim with the device token and the event's queue token; WHEN either is missing THEN SHALL answer `missed`
- WHEN admitted THEN SHALL store the token in `admissionStore` for the event and answer `{ kind: 'admitted', admission }`
- SHALL answer `sign-in` for 401, `retry` (with `afterMs`: 1 s for `NOT_YET`, 1–2 s for `FULL`) for those 409s,
  `paused` for `NO_STOCK`, `missed` for `MISSED` / `EXPIRED` / `MOVED` (and forget the stored place), `sold-out` for
  `QUEUE_CLOSED`; other errors propagate

### Requirement 2: Turn window

#### Acceptance Criteria

- SHALL read `getMyPlace` and answer `{ kind: 'window', turnExpiresAt, serverNow }`, `missed` for the 410 codes, or
  `waiting` when the place has no `turnExpiresAt` yet
