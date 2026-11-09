# Requirements Document

## Introduction

`getOrderCategoriesUseCase` decides whether the buyer may see the Detail Ticket page for FR-11-W1 (rusuh-web#11,
parent FR-11): without a live admission token (NFR-07, `getCategories` security) the outcome is "back to the waiting
room", never an error. It classifies `403 ADMISSION_INVALID` (`../rusuh-documentation/api/openapi.yaml`
`AdmissionInvalid`: "missing, expired or not matching a live slot; back to the waiting room") and passes the order data
through for the page. Sources: `api/openapi.yaml` (`getCategories`), `api/tokens.md` ("Any failure → `403
ADMISSION_INVALID`; the client goes back to the waiting room"), ADR-0004, ADR-0005.

## Glossary

| Term                | Definition                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Order categories    | The `getCategories` body without `eventId`: categories, limits, fee and the order window times         |
| `admission-invalid` | Business outcome: no token, or the API rejected it; the controller sends the buyer to `/queue?event=…` |

## Requirements

### Requirement 1: Classify the admission

**User Story:**

AS a buyer whose order window is over or who arrived without a turn
I WANT to be sent back to the waiting room
SO THAT I can queue again instead of seeing an error

#### Acceptance Criteria

- SHALL expose `execute({ eventId, admissionToken })` in
  `src/core/use_case/booking/get-order-categories.use-case.ts`
- WHEN `admissionToken` is `null` or an empty string THEN SHALL return `{ kind: 'admission-invalid' }` without calling
  `bookingService`
- WHEN `bookingService.getCategories` rejects with an `HttpError` whose `code` is `ADMISSION_INVALID` THEN SHALL
  return `{ kind: 'admission-invalid' }`
- SHALL NOT throw for either case
- SHALL NOT navigate, translate, track analytics or read the admission store

### Requirement 2: Pass the order data through

**User Story:**

AS the order controller
I WANT the categories, limits, fee and order window in one typed result
SO THAT the page and the later steppers and timer (FR-13, FR-17) use the server's numbers

#### Acceptance Criteria

- WHEN the call succeeds THEN SHALL return `{ kind: 'ok', categories, maxTicketsPerOrder, reservedUnits, adminFee,
expiresAt, serverNow }` from the response, in the server's order, without mutating it
- SHALL call `bookingService.getCategories(eventId, admissionToken)` exactly once per `execute`
- WHEN the service rejects with any other error (`UNAUTHORIZED`, `NETWORK_ERROR`, `TIMEOUT`, `INTERNAL_ERROR`,
  `RATE_LIMITED`, `UNKNOWN_ERROR`, a 403 with another code, a non-`HttpError` value) THEN SHALL re-throw it unchanged
- SHALL be registered as `asFunction(GetOrderCategoriesUseCase).singleton()` and typed in `AwilixRegistry`
