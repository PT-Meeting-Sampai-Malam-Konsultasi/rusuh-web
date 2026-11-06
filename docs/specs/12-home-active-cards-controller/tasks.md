# Implementation Plan: Home active cards (controller)

## Overview

Joinable states, the `join` field on card views, `selectEvent` and `joinHint` in the controller.

## Tasks

- [x] 1. Add `JOINABLE_STATES` and the `join` field in `toEventCardView` [Requirement 1]
- [x] 2. Add `selectEvent` and `joinHint` to `HomeController` [Requirement 2]
- [x] 3. Translations and tests [Requirement 1, Requirement 2]
- [x] 4. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 3], [4]] }
```

## Notes

- Temporarily full is decided in FR-03-W1: its issue lists it as disabled, the HiFi shows "Tetap antre".
