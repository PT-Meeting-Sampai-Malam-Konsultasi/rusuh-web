# Implementation Plan: Queue join (entities, services, adapters)

## Tasks

- [x] 1. Queue entities [Requirement 1]
- [x] 2. `DeviceService` and `QueueService` with tests [Requirement 1]
- [x] 3. Device token and queue place stores with tests [Requirement 2]
- [x] 4. Turnstile adapter with tests [Requirement 2]
- [x] 5. DI registration and the registry test [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 3, 4], [5]] }
```
