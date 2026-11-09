# Implementation Plan: Queue live use case

## Overview

Shared place math, the pure rules, then the use case and its DI registration.

## Tasks

- [x] 1. Move `positionOf` / `progressOf` to `place.ts`; join use case imports them [Requirement 1]
- [x] 2. `applyFrontier`, `pollDelayMs`, `canStream`, `streamRetryDelayMs` with tests [Requirements 1–3]
- [x] 3. `FollowQueueUseCase.poll` and `.stream` (tokens, payload parsing) with tests [Requirements 3, 4]
- [x] 4. Register `followQueueUseCase`; `AwilixRegistry` key; registry test [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 3], [4]] }
```
