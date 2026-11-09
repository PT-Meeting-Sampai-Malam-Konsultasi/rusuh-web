# Implementation Plan: Queue frontier service

## Overview

Entity types, `getFrontier`, then the mock frontier and stream.

## Tasks

- [x] 1. `Frontier`, `QueueTurn`, `QueuePauseReason` in `queue.entity.ts` [Requirement 1]
- [x] 2. `queueService.getFrontier` with tests [Requirement 2]
- [x] 3. Mock: per-event served clock shared by join and frontier; `GET frontier`; `stream_off` scenario [Requirement 3]
- [x] 4. Mock: `GET stream` (SSE frontier every second, turn at the front, 409/401) with tests [Requirement 3]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 3], [4]] }
```
