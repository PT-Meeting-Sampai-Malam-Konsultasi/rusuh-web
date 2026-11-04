# Implementation Plan: Home catalog service

## Overview

Catalog entities, `CatalogService.listEvents`, registration and tests.

## Tasks

- [x] 1. Write `src/core/entities/catalog/catalog.entity.ts` [Requirement 1]
- [x] 2. Write `src/core/services/catalog.service.ts` and its test [Requirement 2]
- [x] 3. Register `catalogService` and add it to `AwilixRegistry` [Requirement 2]
- [x] 4. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2], [3], [4]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run`.
