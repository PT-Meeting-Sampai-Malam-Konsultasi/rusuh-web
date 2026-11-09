# Requirements Document

## Introduction

`queueController` takes the buyer from the turn to the order page (FR-08-W1, PRD W-5, App Flow 4.2): auto-claim when
the page is visible, the 60 s countdown when it was in the background, sign-in first for a guest (claim needs a
session, ADR-0025), and the missed state with "Antre lagi".

## Requirements

### Requirement 1: Turn and claim

#### Acceptance Criteria

- WHEN the live place reaches the turn (FR-07) THEN SHALL show `turn` and read the turn window once
- WHEN the turn is reached and the page is visible THEN SHALL claim (a query keyed by event; repeat-safe); WHEN the
  page is hidden THEN SHALL wait, and claim as soon as it is visible again
- WHEN admitted THEN SHALL go to `/order?event={id}` (replace) and track `queue_claim` `admitted`
- WHEN the answer is `retry` THEN SHALL claim again after `afterMs`
- WHEN the answer is `paused` THEN SHALL show the paused view; `sold-out` the sold-out view

### Requirement 2: Guest

#### Acceptance Criteria

- WHEN the answer is `sign-in` THEN SHALL keep the turn view with a "Masuk untuk lanjut" link to
  `/login?next=/queue?event={id}`; back on `/queue` after sign-in, the join and the claim run again

### Requirement 3: Countdown and missed

#### Acceptance Criteria

- SHALL count down from `turnExpiresAt − serverNow` minus the time since that answer (never the device clock alone)
- WHEN the answer is `missed`, or the countdown reaches 0 without an admission, THEN SHALL show `missed`
- "Antre lagi" SHALL join again (a new number at the back) and track `queue_rejoin`
