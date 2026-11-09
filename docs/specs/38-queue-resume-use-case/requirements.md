# Requirements Document

## Introduction

FR-10-W1 (rusuh-web#10, SRS FR-10, PRD W-1, App Flow §6 "Refresh, new tab, app restart"): the place stays the same
across a refresh, a new tab and a restart. The device token and the queue token are already kept in `localStorage`
(ADR-0003); this spec resumes with them through `getMyPlace` instead of joining again, so a refresh costs no Turnstile
check and no write, and a gone place says why.

## Requirements

### Requirement 1: Resume before joining

#### Acceptance Criteria

- WHEN a device token and a queue token for the event are stored THEN `joinQueueUseCase.execute` SHALL read the place
  with `getMyPlace` and answer it as `joined` with `resumed: true`, keeping `joinedServed`
- WHEN `getMyPlace` answers 401 or 404 THEN SHALL join as before
- WHEN it answers 410 `MISSED` or `EXPIRED` THEN SHALL forget the stored place and answer `missed`; `MOVED` → `elsewhere`;
  `QUEUE_CLOSED` → `sold-out`; other errors propagate
- WHEN called with `{ rejoin: true }` ("Antre lagi") THEN SHALL forget the stored place and join

### Requirement 2: Mock like a server

#### Acceptance Criteria

- SHALL keep the mock queue in `localStorage`, shared by the tabs like a real server (switching the placement scenario
  still starts it over)
- `me` SHALL run the pre-queue draw at opening and return `opensAt` while the place waits for it
