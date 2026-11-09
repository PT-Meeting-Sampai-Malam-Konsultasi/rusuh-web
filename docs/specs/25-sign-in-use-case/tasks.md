# Implementation Plan: Sign-in use cases

## Overview

Shared device-token helper, then the three use cases, then the refresh wiring in `coreHttp`.

## Tasks

- [x] 1. `withDeviceToken` helper with tests; `joinQueueUseCase` uses it [Requirement 1]
- [x] 2. `RequestSignInCodeUseCase` with tests [Requirement 2]
- [x] 3. `VerifySignInCodeUseCase` with tests [Requirement 3]
- [x] 4. `RefreshSessionUseCase` with tests [Requirement 4]
- [x] 5. Wire `refreshSession` into `coreHttp` (lazy resolve, single flight) with tests [Requirement 4]
- [x] 6. DI registration and the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 3, 4], [5], [6]] }
```

## Notes

- The admission-token gate (guest signing in on the order page) is in the service already; the order-page sheet
  passes it once #42 is merged.
