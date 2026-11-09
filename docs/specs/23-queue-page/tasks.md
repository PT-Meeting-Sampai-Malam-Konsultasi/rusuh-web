# Implementation Plan: Queue page

## Tasks

- [x] 1. Route with Suspense and the screen [Requirement 1, 2]
- [x] 2. Event poster and phone banner [Requirement 1]
- [x] 3. Waiting view with the number, track and notes [Requirement 1]
- [x] 4. Joining, pre-queue, paused, sold-out and message views [Requirement 2]
- [x] 5. Mock handlers for `/devices` and `/join` [Requirement 1, 2]
- [x] 6. Gate check and browser check at 390 and 1440, ID and EN [ALL]

## Task Dependency Graph

```json
{ "waves": [[5], [1, 2], [3, 4], [6]] }
```
