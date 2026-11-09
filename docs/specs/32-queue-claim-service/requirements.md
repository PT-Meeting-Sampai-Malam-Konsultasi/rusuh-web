# Requirements Document

## Introduction

Wraps the turn for FR-08-W1 (rusuh-web#8, parent FR-08, PRD W-5): `POST /queue/{eventId}/claim` (`claimTurn`) and
`GET /queue/{eventId}/me` (`getMyPlace`, for `turnExpiresAt`). The contract is Apidog: claim needs a signed-in session
(ADR-0025), so `queueHttp` now sends the bearer token and refreshes once on 401, like `coreHttp`.

## Requirements

### Requirement 1: Admission type and calls

#### Acceptance Criteria

- SHALL add `Admission` (`admissionToken`, `slotId`, `maxTickets`, `expiresAt`, `serverNow`) to `queue.entity.ts`
- SHALL add `queueService.claimTurn(eventId, deviceToken, queueToken)` → `POST queue/{eventId}/claim` and
  `queueService.getMyPlace(eventId, deviceToken, queueToken)` → `GET queue/{eventId}/me`, with `X-Device-Token` and
  `X-Queue-Token`; errors propagate
- SHALL give `queueHttp` `getAccessToken` and `refreshSession`, as `coreHttp` has

### Requirement 2: Mock claim and place

#### Acceptance Criteria

- SHALL compute each place's turn time from the event clock (`served` reaches `seq`) and its 60 s window
- `claim`: 401 `UNAUTHORIZED` without `Authorization`; 409 `NOT_YET` before the turn; 410 `MISSED` after the window
  (and forget the place); else 200 with an admission (`mock-admission.{event}.{seq}`, 16 minutes, `maxTickets` 3),
  the same on a repeat
- `me`: the place with `served` and, from the turn on, `turnExpiresAt`; 410 `MISSED` after the window
- `join`: a place whose window passed without a claim is forgotten, so joining again gives a new number at the back
