# Requirements Document

## Introduction

`QueueController` for `/queue?event=<id>`: runs the join once, loads the event for the header from the Home event
list (same query and cache as Home), and turns the result into page states and translated strings.

## Requirements

### Requirement 1: States

#### Acceptance Criteria

- No `event` param → `no-event`; while joining → `joining`
- Joined with `state: open` → `waiting`; `preopen` or `seq: null` → `prequeue`; `paused` → `paused`;
  `closed` or `sold-out` → `sold-out`; `not-found` → `not-found`; `elsewhere` → `elsewhere`; thrown errors → `error`
  with the translated code and a retry

### Requirement 2: Waiting view

#### Acceptance Criteria

- Position = `seq − served`, at least 1 (the turn itself is FR-08-W1), formatted for the locale ("1.248")
- Progress = `(served − joinedServed) / (seq − joinedServed)`, 0–100
- Labels "Sedang dilayani No. <served>" and "Nomor Anda No. <seq>"

### Requirement 3: Other views

#### Acceptance Criteria

- Pre-queue: the opening time in the event time zone and a countdown from `opensAt − serverNow` plus the time since
  the answer (never the device clock alone)
- Paused: the kept number and the reason: stock (the event is `temporarily_full`) or a check by the organiser
- Sold out: the event name in the lead

### Requirement 4: Join once, analytics

#### Acceptance Criteria

- The join SHALL run once per page visit (no refetch on focus or reconnect, no automatic retry); retry is manual
- SHALL track the page view `queue` and `queue_join` with `eventId` and the outcome
