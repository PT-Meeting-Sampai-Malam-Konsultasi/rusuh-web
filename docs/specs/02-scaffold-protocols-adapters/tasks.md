# Implementation Plan: Scaffold step 2 — protocols, config, adapters

> **Updated 13 Nov 2026:** SSE is dropped; the waiting room follows the queue by polling the frontier only.
> `QueueStreamProtocol` and the queue-stream adapter were removed.

## Overview

Define the framework-free contracts in src/core/protocols and their implementations in src/infrastructure (scaffold-app step 2).

## Tasks

- [x] 1. Write the five protocol files [Requirement 1]
- [x] 2. Write config.ts [Requirement 2]
- [x] 3. Write HTTP, storage, token-store and analytics adapters [Requirement 3]
- [x] 4. Write the queue-stream adapter [Requirement 4]
- [x] 5. Write tests for config and every adapter [ALL]
- [x] 6. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3, 4, 5], [6]] }
```

## Notes

- TokenStoreProtocol was added (not in the reference) so the HTTP adapter can read the in-memory access token before the sign-in feature exists.
- Vitest uses Vite's native tsconfig path resolution; vite-tsconfig-paths was removed.
