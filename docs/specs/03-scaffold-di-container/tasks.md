# Implementation Plan: Scaffold step 3 — DI container

## Overview

Set up the Awilix container, the AwilixRegistry type and the four registries in their strict order (scaffold-app step 3).

## Tasks

- [x] 1. Create container.ts and registry.types.ts [Requirement 1]
- [x] 2. Write the four registries [Requirement 2]
- [x] 3. Write registerAll() [Requirement 2]
- [x] 4. Write the completeness test [Requirement 3]
- [x] 5. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3, 4], [5]] }
```

## Notes

- Context hooks and ERROR_CODE_MAP are placeholders here and are replaced in step 5 (marked TODO).
- coreHttp has no refreshSession yet; the sign-in feature (NFR-07-W2) wires it.
- storage-keys.ts was created here because the HTTP adapter reads the locale from storage.
