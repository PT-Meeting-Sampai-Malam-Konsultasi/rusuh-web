# Implementation Plan: Scaffold step 6 — layout, providers, error boundaries

## Overview

Make the app runnable: root layout, providers, error boundaries, 404 and a placeholder home (scaffold-app step 6).

## Tasks

- [x] 1. Write providers.tsx and the root layout [Requirement 1]
- [x] 2. Write error.tsx and global-error.tsx [Requirement 2]
- [x] 3. Write StatusScreen [Requirement 2]
- [x] 4. Write NotFoundController, NotFound screen and not-found.tsx; register the controller [Requirement 3]
- [x] 5. Replace the generator home with a placeholder screen [Requirement 1]
- [x] 6. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3, 4, 5], [6]] }
```

## Notes

- Found and fixed: the generated Turbopack rule made CSS Modules global (no class names in the HTML). next.config.ts now has a separate CSS Modules rule; the scaffold rule documents it.
- Home stays a placeholder until FR-01-W1 … FR-05-W1.
