# Implementation Plan: Order booking service

## Overview

Booking entities, the admission store (protocol + in-memory adapter), `catalogService.getEvent`,
`bookingService.getCategories`, their registrations and the MSW mock for both operations, with tests. Writer:
service-writer.

## Tasks

- [x] 1. Write `src/core/entities/booking/booking.entity.ts` (`Seating`, `CategoryAvailability`, `Category`, `GetCategoriesResponse`; `Money` imported from the catalog entity) [Requirement 1]
- [x] 2. Write `src/core/protocols/admission-store.protocol.ts` and `src/infrastructure/adapters/admission-store.adapter.ts` (`createAdmissionStore`, `MOCK_ADMISSION_TOKEN`) with `__tests__/admission-store.adapter.test.ts` [Requirement 3]
- [x] 3. Add `getEvent` to `src/core/services/catalog.service.ts`; write `src/core/services/booking.service.ts`; tests in `catalog.service.test.ts` and `booking.service.test.ts` [Requirement 2]
- [x] 4. Register `admissionStore` (mock fallback when `config.apiMock`) in `infrastructure.registry.ts` and `bookingService` in `services.registry.ts`; add both to `AwilixRegistry` and to `KEYS` in `registry.test.ts` [Requirement 2, Requirement 3]
- [x] 5. Mock API: `GET /events/:eventId` in `catalog.handlers.ts`; `fixtures/categories.fixture.ts`; `handlers/booking.handlers.ts` added to `HANDLER_FACTORIES`; `admission_invalid` in `MOCK_SCENARIOS`; handler and scenario tests [Requirement 4]
- [x] 6. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2], [3], [4, 5], [6]] }
```

## Notes

- Gate: `npm run typecheck && npm run lint && npx vitest --run` (coverage for the new files ≥ 85%).
- The service takes the token as a parameter; only the controller reads `admissionStore` (spec 14), and only the use
  case decides what a missing token means (spec 13).
- Keep tokens out of `storage`, query keys and analytics: the in-memory store is the only holder.
- `MOCK_ADMISSION_TOKEN` is not a secret and never reaches production builds' behaviour, because the fallback is wired
  only when `config.apiMock` is true.
- Deferred: filling the store from `claimTurn` (FR-08-W1); keeping it across a refresh (NFR-02-W1 / FR-10-W1);
  `validateAttendee` / `createBooking` on `bookingService` (FR-15-W1 / FR-14-W1).
