# Implementation Plan: Home controller

## Overview

Formatters, stamp table, controller, registration and tests.

## Tasks

- [x] 1. Write date, money and duration formatters in `src/utils/format/` with tests [Requirement 2]
- [x] 2. Write the state → stamp table `src/utils/constants/event-state.ts` and the poster tone helper [Requirement 2]
- [x] 3. Write `src/controllers/home.controller.ts` [Requirement 1, Requirement 2, Requirement 3]
- [x] 4. Write its tests [Requirement 1, Requirement 2, Requirement 3]
- [x] 5. Register `homeController`, add it to `AwilixRegistry` [Requirement 1]
- [x] 6. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2], [3], [4, 5], [6]] }
```

## Notes

- `refetchInterval` 30 s keeps stamps fresh; the CDN absorbs it (5–10 s cache).
