# Implementation Plan: Home status cards (view)

## Overview

`QUEUE_ANYWAY_STATES`, `join.kind`, the sold-out `overlay` word, translations and tests.

## Tasks

- [x] 1. Add `QUEUE_ANYWAY_STATES` and `join.kind` in `toEventCardView` [Requirement 1]
- [x] 2. Add the `overlay` word for sold-out events [Requirement 2]
- [x] 3. Translations (`home_queue_anyway`, `home_sold_out_overlay`) and tests [Requirement 1, Requirement 2]
- [x] 4. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2], [3], [4]] }
```

## Notes

- Temporarily full follows the HiFi ("Tetap antre"), not the issue's "disabled": agreed in planning,
  because the paused queue still accepts joins (decided 9 Nov 2026).
