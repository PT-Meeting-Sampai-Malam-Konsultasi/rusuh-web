# Requirements Document

## Introduction

`queueController` follows the queue after the join (FR-07-W1, rusuh-web#7): polls the frontier, switches to the stream
near the front, falls back to polling, and turns the newest frontier into the waiting, paused and sold-out views,
with "Diperbarui n detik lalu" and "n orang masuk / menit" (HiFi `waiting-room.html` `.wr-eta em`). The ETA range is
FR-09-W1; the turn screen and claim are FR-08-W1.

## Requirements

### Requirement 1: Polling

#### Acceptance Criteria

- SHALL poll `followQueueUseCase.poll` with `refetchInterval` from `pollDelayMs` while the place is `waiting` or
  `paused` with a number, the stream is not healthy and the turn has not been reached
- SHALL stop polling in a background tab (TanStack default) and poll once on return (`refetchOnWindowFocus`)
- SHALL keep the last place when a poll fails or answers `not-found`

### Requirement 2: Stream

#### Acceptance Criteria

- WHEN `canStream(position, streamFrom)` THEN SHALL open `followQueueUseCase.stream` and stop polling while it
  delivers
- SHALL write each streamed frontier into the same query cache entry as the polled one
- WHEN the stream falls back or closes THEN SHALL poll (2 s at most after a fallback) and try again after
  `streamRetryDelayMs`
- SHALL close the stream on unmount, on leaving the stream range and at the turn
- SHALL track `queue_stream` with `outcome` `open`, the fallback reason or `closed`

### Requirement 3: Views

#### Acceptance Criteria

- SHALL derive the status from the live place: `closed` → sold-out, `paused` → paused, `open` → waiting
- SHALL add to the waiting view `updated` ("Diperbarui 3 detik lalu", from the time since the newest frontier or
  join answer, ticking every second) and `rate` ("300 orang masuk / menit"; null when `ratePerMin` is 0 or absent)
- SHALL take the paused reason from `Frontier.reason` (`stock` → temporarily full, `operator` → organiser checking),
  falling back to the event state as before
- WHEN the turn is reached THEN SHALL show position 1 at 100% and stop updates (FR-08 takes over)
