# Implementation Plan: Scaffold step 5 — contexts and shared components

## Overview

Create the app-wide contexts (loading, error popup, network status) and the shared Poster Sablon components, and replace the step 3 DI placeholders (scaffold-app step 5).

## Tasks

- [x] 1. Write the three contexts [Requirement 1]
- [x] 2. Write Button, Stamp, Timer, TextField [Requirement 2]
- [x] 3. Write LoadingOverlay, ErrorPopup, OfflineBanner [Requirement 2]
- [x] 4. Write error-codes, query-keys and routes constants [Requirement 3]
- [x] 5. Replace the DI placeholders [Requirement 1, Requirement 3]
- [x] 6. Write tests [ALL]
- [x] 7. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3, 4, 5, 6], [7]] }
```

## Notes

- toggleLoading flips the overlay (on in mutationFn, off in onSuccess/onError), as the controller rule prescribes; avoid two overlay-driving mutations at once.
- Controllers fall back to ERROR_CODE_MAP.UNKNOWN_ERROR (no @utils import); the steering examples were aligned.
