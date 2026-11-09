# Requirements Document

## Introduction

The business rules of FR-07-W1 (rusuh-web#7): how often to poll the frontier, when to stream, how a frontier moves
the place (position, progress, state, turn) and how to recover when the stream fails (PRD W-2, ADR-0003, ADR-0015,
App Flow 4.2 "Updates").

## Glossary

| Term       | Definition                                                                   |
| ---------- | ---------------------------------------------------------------------------- |
| Live place | The joined place with the newest frontier applied                            |
| Fallback   | Polling every 2 s because the stream failed; the stream is tried again later |

## Requirements

### Requirement 1: Apply a frontier

**User Story:**

AS a buyer in the waiting room
I WANT my position and the track to follow the frontier
SO THAT I see the line move without refreshing

#### Acceptance Criteria

- SHALL take `served` as the larger of the place's and the frontier's (a CDN-cached or late frontier never moves
  the buyer back)
- SHALL take `state` from the frontier, except while the place is still `preopen` (the draw is a join, not a frontier)
- SHALL recompute `position` (`seq − served`, at least 1) and `progress` from `joinedServed` with the same rules as
  the join (one shared module)
- SHALL report `turnReached` when `seq ≤ served`

### Requirement 2: Poll interval

#### Acceptance Criteria

- SHALL poll every 10 s when more than 10,000 places back, 5 s up to 10,000, 2 s up to 1,000, each ±20% jitter
- WHEN the position is unknown THEN SHALL use 10 s
- WHEN the stream fell back THEN SHALL poll at most every 2 s

### Requirement 3: Stream

#### Acceptance Criteria

- SHALL allow the stream only when `0 < position ≤ streamFrom` (`streamFrom` 0 or absent turns it off)
- SHALL open the stream with this device's token and the event's queue token; WHEN either is missing THEN SHALL not
  open it
- SHALL hand the controller parsed `Frontier` and `QueueTurn` payloads and drop malformed ones
- SHALL decide the next try: a first failed connect retries after 3 s; a second in a row, a slow first event or
  silence waits 60 s (polling meanwhile); a stream closed by the server reconnects after 3 s

### Requirement 4: Poll

#### Acceptance Criteria

- SHALL return `{ kind: 'frontier', frontier }`, or `{ kind: 'not-found' }` for 404 `NOT_FOUND`; other errors propagate
