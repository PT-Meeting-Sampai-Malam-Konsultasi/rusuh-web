# Requirements Document

## Introduction

Business rule for FR-19-W1 (rusuh-web#18, "Countdowns from server time, kept across refresh"; parent FR-19,
rusuh-documentation#19). SRS FR-19 (`requirements/srs-v1.0-rusuh-booking-tiket.html` line 249): the booking timer runs
on the server, cannot be bypassed by the client, and **stays consistent when the page is refreshed**. Today a reload of
`/order` loses the in-memory admission token, so `getOrderCategoriesUseCase` answers `admission-invalid` at once and the
page detours through the waiting room (resume, claim again, back to `/order`), with a moment of "Giliran terlewat" and
repeated `queue_join` / `queue_claim` analytics. This spec makes the use case **claim again** when it has no token and
this browser has a stored queue place: `claimTurn` is idempotent ("a retry … returns the same token, so it is safe to
repeat", `openapi.yaml` `claimTurn`; ADR-0030: "The same device after a restart already resumes: the claim is idempotent
and returns the same slot and end"; `architecture/sequence-diagrams.md` J9.6: `admissionToken`, `slotId` in memory, "A
new claim returns the same slot, so storing it is optional"). The categories answer then carries the same `expiresAt`
(the lease end) and the countdown carries on. A browser with no stored place (never queued, or storage cleared) is sent
to the waiting room as today, never to the time's-up sheet. ADR-0005 (server-time order window), ADR-0021 (admission
token), ADR-0030 (same-device resume).

Out of scope: keeping order input (categories picked, holders, NIKs) across a refresh (J9.6 "optional"; NIKs never go to
disk); the payment countdown (FR-21-W1: the payment page does not exist yet; rusuh-web#18 also lists Payment, which
follows the same rule when that page is built); storing the admission token in `sessionStorage` or anywhere but
`admissionStore` (rejected: J9.6 and the adapter's memory-only rule; a re-claim is free and returns the same slot);
changes to `claimTurnUseCase`.

## Glossary

| Term            | Definition                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Admission token | Opaque token from `claimTurn`, kept per event in `admissionStore` (memory only); sent as `X-Admission-Token`           |
| Stored place    | `StoredQueuePlace` kept per event in `queuePlaceStore` (localStorage); survives a reload, removed when a turn ends     |
| Reload          | The `/order` tab reloaded or opened fresh: `admissionStore.get(eventId)` is null                                       |
| Re-claim        | `claimTurnUseCase.execute(eventId)` from the order page with the stored device and queue tokens; returns the same slot |
| Lease end       | The end of the 5-minute order window (ADR-0005), the same for every claim of the slot; `getCategories.expiresAt`       |
| Resumed         | An `ok` answer obtained by a re-claim in this call (`resumed: true`), for the controller's analytics                   |
| Window ended    | A re-claim that ran and answered `missed` (410 MISSED / EXPIRED / MOVED): the turn is over on the server               |

## Requirements

### Requirement 1: Claim again when the token is missing and a place is stored

**User Story:**

AS a buyer who reloaded the order page during my 5 minutes
I WANT the page to pick up my turn where it was
SO THAT I keep my slot and the time I have left, without a trip through the waiting room (FR-19)

#### Acceptance Criteria

- WHEN `execute({ eventId, admissionToken })` runs with `admissionToken` null or `''` and `queuePlaceStore.get(eventId)`
  returns a place THEN it SHALL call `claimTurnUseCase.execute(eventId)` exactly once before any `bookingService` call
- WHEN the claim answers `{ kind: 'admitted', admission }` THEN it SHALL call `bookingService.getCategories(eventId,
admission.admissionToken)` once and return the `ok` result with `resumed: true`
- SHALL rely on `claimTurnUseCase` to store the new token (`admissionStore.set`, as today); SHALL NOT write the token to
  any other store, storage, cookie or log, and SHALL NOT return it
- SHALL pass the server's `expiresAt` and `serverNow` through unchanged (the lease end is the server's; no client
  arithmetic on it)
- WHEN `getCategories` with the re-claimed token answers 403 `ADMISSION_INVALID` THEN it SHALL return
  `{ kind: 'admission-invalid' }` without a second claim

### Requirement 2: No stored place, no claim

**User Story:**

AS a buyer whose browser never queued for this event (or whose storage was cleared)
I WANT to be sent to the waiting room
SO THAT I join the line instead of being told my 5 minutes are up

#### Acceptance Criteria

- WHEN `admissionToken` is null or `''` and `queuePlaceStore.get(eventId)` returns null THEN it SHALL return
  `{ kind: 'admission-invalid' }` without calling `claimTurnUseCase` or `bookingService`
- SHALL only read `queuePlaceStore` (`get`); SHALL NOT call `set` or `remove` on it
- SHALL NOT read `queuePlaceStore` when `admissionToken` is non-empty

### Requirement 3: Classify the re-claim's other answers

**User Story:**

AS the order page
I WANT one business outcome per claim answer
SO THAT I show the time's-up sheet when the turn is over and send the buyer to the waiting room for everything else

#### Acceptance Criteria

- WHEN a claim that ran answers `missed` THEN it SHALL return `{ kind: 'window-ended' }` without a `bookingService` call
- WHEN the claim answers `sign-in`, `retry`, `paused` or `sold-out` THEN it SHALL return `{ kind: 'admission-invalid' }`
  without a `bookingService` call (the waiting room handles each of them)
- WHEN the claim throws (network, 5xx, `ADMISSION_UNAVAILABLE`, any code `claimTurnUseCase` does not classify) THEN the
  error SHALL propagate unchanged
- SHALL NOT retry the claim itself (the controller's query retry policy decides)

### Requirement 4: A token that exists is never re-claimed

**User Story:**

AS the queue service
I WANT the order page to claim only when it has no token
SO THAT a rejected token never starts a claim loop and a normal load costs no extra request

#### Acceptance Criteria

- WHEN `admissionToken` is non-empty THEN it SHALL NOT call `claimTurnUseCase`, and the `ok` result SHALL have
  `resumed: false`
- WHEN a non-empty token is rejected with 403 `ADMISSION_INVALID` THEN it SHALL return `{ kind: 'admission-invalid' }`
  and SHALL NOT claim
- WHEN `getCategories` throws any other error (with either token) THEN the error SHALL propagate unchanged
- SHALL make at most one claim and at most one `getCategories` call per `execute`

### Requirement 5: Result type, DI and tests

**User Story:**

AS a developer
I WANT the new outcome typed and the dependencies wired
SO THAT the controller handles every branch and the container resolves it

#### Acceptance Criteria

- SHALL extend `OrderCategoriesResult` with `resumed: boolean` on the `ok` member and a new member
  `{ kind: 'window-ended' }`
- SHALL depend on `Pick<AwilixRegistry, 'bookingService' | 'claimTurnUseCase' | 'queuePlaceStore'>`;
  `services.registry.ts` and `AwilixRegistry` keep their keys (no new key), and `di/__tests__/registry.test.ts` still
  passes
- SHALL NOT import React, Next.js, a browser API, an adapter or a translation; SHALL NOT return text; no module-level state
- SHALL test in `src/core/use_case/booking/__tests__/get-order-categories.use-case.test.ts` with plain object mocks:
  every claim branch, the no-place branch, one claim per call, no claim with a token, no claim after a rejected token,
  the token passed to `getCategories`, `resumed` true / false, `queuePlaceStore` read only, error propagation from the
  claim and from `getCategories`; coverage ≥ 85%
- SHALL add `resumed: false` to the `ok` fixtures of `src/controllers/__tests__/order.controller.test.ts` so
  `tsc --noEmit` passes (behaviour is spec 65)
