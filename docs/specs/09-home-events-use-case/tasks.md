# Implementation Plan: Home events use case

## Overview

Ordering and featured-event rules for Home, registered in DI.

## Tasks

- [x] 1. Write `src/core/use_case/catalog/get-home-events.use-case.ts` [Requirement 1, Requirement 2]
- [x] 2. Write its tests [Requirement 1, Requirement 2]
- [x] 3. Register `getHomeEventsUseCase` and add it to `AwilixRegistry` [Requirement 2]
- [x] 4. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 3], [4]] }
```

## Notes

- The order and the featured rule are ours (the HiFi shows live first, finished last); revisit with the BA if the
  owner wants a curated featured event.
