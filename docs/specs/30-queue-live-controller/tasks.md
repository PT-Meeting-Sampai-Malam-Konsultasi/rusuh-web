# Implementation Plan: Queue live controller

## Tasks

- [x] 1. Frontier query with `pollDelayMs`; live place through `applyFrontier`; status from it [Requirements 1, 3]
- [x] 2. Stream effect: open, setQueryData, fallback and retry timers, close [Requirement 2]
- [x] 3. `updated` and `rate` in the waiting view; paused reason from the frontier; turn stops updates [Requirement 3]
- [x] 4. Translations (ID, EN) and tests [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 3], [4]] }
```
