# Requirements Document

## Introduction

FR-05-W1 (rusuh-web#5, SRS FR-05, PRD H-2, App Flow "HOME →|no queue| CLAIM"): when there is no queue, the buyer goes
straight to the order page. The API has no "no queue" flag; the join answer says it: `served ≥ seq`, nobody ahead.
The claim (FR-08) does the rest, without the turn screen or its 60 s timer.

## Requirements

### Requirement 1: Skip

#### Acceptance Criteria

- WHEN the join answer (not a later frontier) already has `served ≥ seq` THEN the waiting room SHALL show the `entering`
  state ("Tidak ada antrian. Kami bawa Anda ke pemilihan tiket…") instead of the turn view, and claim at once
- SHALL NOT read the turn window in that case
- WHEN admitted THEN SHALL go to `/order?event={id}` (replace), as FR-08
- WHEN the claim answers `sign-in` THEN SHALL go straight to `/login?next=/queue?event={id}` (replace), so the guest
  comes back and is claimed through
- `retry` keeps `entering`; `paused` and `sold-out` show their views
- SHALL track `queue_skip` once

### Requirement 2: Mock

#### Acceptance Criteria

- `?mock=no_queue` SHALL place new numbers with nobody ahead (the turn at once)
