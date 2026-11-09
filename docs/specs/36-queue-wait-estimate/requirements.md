# Requirements Document

## Introduction

The wait estimate rules for FR-09-W1 (rusuh-web#9, PRD W-3, `08-eta-estimation` §03–04): position over the admit
speed from the frontier, shown as a rounded range that only goes down. Pure functions, shared by the controller.

## Requirements

### Requirement 1: Range

#### Acceptance Criteria

- SHALL compute `position ÷ rateHigh` … `position ÷ rateLow` in minutes
- SHALL round outward: the low end down and the high end up, in steps of 1 min under 10 min, 5 min under 60, 10 min
  above (chosen by the high end); the low end is at least 1
- WHEN the high end is under 1 minute THEN SHALL answer `soon`
- WHEN `rateLow` or `rateHigh` is 0 or absent, or the position is unknown THEN SHALL answer no estimate

### Requirement 2: Only go down

#### Acceptance Criteria

- WHEN the new high end is above the shown one by 30% or less THEN SHALL keep the shown range (a wobble)
- WHEN it is more than 30% above THEN SHALL show the new range (a real slowdown)
- WHEN it is lower THEN SHALL show the new range
