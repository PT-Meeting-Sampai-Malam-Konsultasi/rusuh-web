# Requirements Document

## Introduction

Wraps `listEvents` (`GET /events`, core.booking) so Home can show every event sold online with its sale state
(PRD H-1, FR-01). First spec of FR-01-W1.

## Glossary

| Term         | Definition                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| EventSummary | One event as `listEvents` returns it (`openapi.yaml` `EventSummary`)                                                     |
| EventState   | Home status stamp: `coming_soon`, `waiting_room_open`, `on_sale`, `almost_gone`, `temporarily_full`, `sold_out`, `ended` |
| serverNow    | Server time of the response; every relative time on Home is computed from it                                             |

## Requirements

### Requirement 1: Catalog types

**User Story:**

AS a web developer
I WANT typed catalog entities that match the contract
SO THAT Home and later screens share one event shape

#### Acceptance Criteria

- SHALL define `EventState`, `Money`, `EventSummary` and `ListEventsResponse` in `src/core/entities/catalog/catalog.entity.ts`
- SHALL mark optional only the fields the contract leaves optional; `soldOutAt` is `string | null`
- SHALL NOT contain runtime code

### Requirement 2: Catalog service

**User Story:**

AS a controller
I WANT `catalogService.listEvents()`
SO THAT I can load the event list through DI

#### Acceptance Criteria

- SHALL call `coreHttp.get('events')` and return `HttpResponse<ListEventsResponse>`
- SHALL NOT transform data or catch errors
- SHALL be registered as a singleton and typed in `AwilixRegistry`
