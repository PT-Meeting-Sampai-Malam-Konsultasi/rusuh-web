# Requirements Document

## Introduction

Data layer for FR-11-W1 (rusuh-web#11, parent FR-11 "Sistem menampilkan detail event beserta kategori tempat"):
typed booking entities, `catalogService.getEvent` (`GET /events/{eventId}`, public) and a new
`bookingService.getCategories` (`GET /events/{eventId}/categories`, bearer + `X-Admission-Token`, NFR-07), a minimal
in-memory admission store, and the MSW mock for both operations. Seating is by capacity only, no seat map (aanwijzing
T-11; `Category.seating` "No seat numbers: entry by category"). Sources: `../rusuh-documentation/api/openapi.yaml`
(`getEvent`, `getCategories`, `Category`), `../rusuh-documentation/api/tokens.md`, ADR-0004, ADR-0005, ADR-0014.
First spec of FR-11-W1.

## Glossary

| Term               | Definition                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Category           | One seat category of an event as `getCategories` returns it (`openapi.yaml` `Category`): name, description, seating, price, availability |
| Admission token    | `X-Admission-Token`, an `admission+jwt` from `claimTurn` (queue), valid for the 5-minute order window (ADR-0005, `api/tokens.md`)        |
| Admission store    | In-memory map `eventId → admission token`; filled by FR-08-W1 (claimTurn), read by the order page                                        |
| reservedUnits      | Units the queue reserved for this admission, 1–3 (ADR-0004); the order may not exceed it                                                 |
| maxTicketsPerOrder | Policy maximum per order (N-1), 3                                                                                                        |
| Mock token         | Placeholder token the admission store returns for any event when `config.apiMock` is true, so `/order` works in dev without the queue    |

## Requirements

### Requirement 1: Booking entities

**User Story:**

AS a web developer
I WANT typed booking entities that match the `getCategories` contract
SO THAT the order page and the later steppers, summary and hold (FR-12/13/14) share one shape

#### Acceptance Criteria

- SHALL define `Seating`, `CategoryAvailability`, `Category` and `GetCategoriesResponse` in
  `src/core/entities/booking/booking.entity.ts`
- SHALL reuse `Money` from `src/core/entities/catalog/catalog.entity.ts` (type-only import), not redeclare it
- SHALL type every contract field, including the ones this ticket does not display (`price`, `availability`,
  `available`, `seating`, `entryGate`, `adminFee`, `expiresAt`, `serverNow`)
- SHALL mark optional only `description`, `seating`, `entryGate` and `available` (the contract's non-required fields)
- SHALL NOT contain runtime code

### Requirement 2: Event and categories services

**User Story:**

AS a controller or use case
I WANT `catalogService.getEvent(eventId)` and `bookingService.getCategories(eventId, admissionToken)`
SO THAT I can load the event header and the category list through DI

#### Acceptance Criteria

- SHALL add `getEvent(eventId)` to `CatalogService`, calling `coreHttp.get<EventSummary>('events/{id}')` with the id
  passed through `encodeURIComponent`
- SHALL add `src/core/services/booking.service.ts` with `getCategories(eventId, admissionToken)`, calling
  `coreHttp.get<GetCategoriesResponse>('events/{id}/categories')` with the id encoded and the header
  `X-Admission-Token: <admissionToken>`
- SHALL return `HttpResponse<T>` from both methods
- SHALL NOT transform data, catch errors or read the admission store (the token is a parameter)
- SHALL register `bookingService` as `asFunction(BookingService).singleton()` and type it in `AwilixRegistry`
- WHEN `coreHttp` rejects with an `HttpError` (`NOT_FOUND`, `UNAUTHORIZED`, `ADMISSION_INVALID`, transport codes) THEN
  the same error SHALL reach the caller unchanged

### Requirement 3: Admission store

**User Story:**

AS the order page (now) and the claim step (FR-08-W1, later)
I WANT one place in memory that holds the admission token per event
SO THAT the token issued at the turn reaches `getCategories` without being persisted

#### Acceptance Criteria

- SHALL define `AdmissionStoreProtocol` in `src/core/protocols/admission-store.protocol.ts` with
  `get(eventId): string | null` and `set(eventId, token: string | null): void`, zero imports
- SHALL implement it in `src/infrastructure/adapters/admission-store.adapter.ts` as `createAdmissionStore(options)`,
  holding tokens in a closure `Map`; `set(eventId, null)` removes the entry
- SHALL register it as `admissionStore` with `asFunction(...).singleton()` in `infrastructure.registry.ts` and type it
  in `AwilixRegistry`
- WHEN `config.apiMock` is true THEN the registered store SHALL return the mock token for any event that has no stored
  token
- WHEN `config.apiMock` is false and nothing was set for an event THEN `get` SHALL return `null`
- SHALL NOT write tokens to `localStorage`, `sessionStorage`, cookies or logs

### Requirement 4: Mock API

**User Story:**

AS a developer or QA without a backend
I WANT `GET /events/:id` and `GET /events/:id/categories` mocked with the HiFi data
SO THAT every state of `/order` can be seen locally with `?mock=<scenario>`

#### Acceptance Criteria

- SHALL answer `GET {core}/events/:eventId` with the matching event from `eventsFixture(now)`, and with a 404 problem
  `NOT_FOUND` for an unknown id (also under the `empty` scenario, where no event exists)
- SHALL answer `GET {core}/events/:eventId/categories` with the four HiFi categories (Festival A, Festival B, Tribun
  Bawah, Tribun Atas), descriptions in ID or EN from `Accept-Language`, `maxTicketsPerOrder` 3, `reservedUnits` 3,
  `adminFee` Rp 10.000, `serverNow` = now, `expiresAt` = now + 5 minutes
- WHEN the `X-Admission-Token` header is missing or empty THEN the categories handler SHALL answer 403
  `ADMISSION_INVALID`
- WHEN the event id is unknown THEN the categories handler SHALL answer 403 `ADMISSION_INVALID` (a token cannot match an
  event that does not exist; `getCategories` lists no 404)
- SHALL add the scenario `admission_invalid` to `MOCK_SCENARIOS`; under it the categories handler SHALL answer 403
  `ADMISSION_INVALID`
- SHALL honour `slow`, `error` and `offline` on both handlers through `failure()`
- WHEN the scenario is `sold_out` THEN every category SHALL have `availability: 'sold_out'`
