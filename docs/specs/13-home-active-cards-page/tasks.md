# Implementation Plan: Home active cards (page)

## Overview

`ButtonLink`, the hero call to action, active list cards, the shell wiring and a live sample event in the mock.

## Tasks

- [x] 1. `ButtonLink` with the `sm` size on the shared button styles [Requirement 1]
- [x] 2. Hero call to action and hint [Requirement 1, Requirement 3]
- [x] 3. Active `EventCard` with a stretched link, wired through `EventList` and the shell [Requirement 2, Requirement 3]
- [x] 4. A second live event in the mock so the list shows an active card [Requirement 2]
- [x] 5. Run the gate check and compare at 390 and 1440, ID and EN [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 4], [2, 3], [5]] }
```

## Notes

- `/queue` does not exist until FR-06-W1: links have prefetch off, and following one shows the 404 page until then.
