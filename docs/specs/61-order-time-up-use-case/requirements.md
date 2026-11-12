# Requirements Document

## Introduction

Business rule for FR-18-W1 (rusuh-web#17, "Web: Order: time's-up sheet and queue again"; parent FR-18,
rusuh-documentation#18). When the 5-minute order window runs out before a hold, the turn is over for good: SRS FR-18
(`requirements/srs-v1.0-rusuh-booking-tiket.html` line 248: the booking session is cancelled, the slot goes to the next
in line, the customer is notified and directed out of the booking page), the 21 Oct decision A-10 / Q-26
(`analysis/requirements-review.md`: "queue again at the back"), A-11 / Q-28 (the 5-minute window ends at the hold),
`architecture/customer-journey.md` T1 (lines 305–309: the admission token is no longer valid, the slot is freed,
"Sesi berakhir": queue again at the back). `endOrderWindowUseCase` makes this device forget the dead admission token and
the stored queue place for that event, so the next visit to the waiting room joins fresh at the back instead of resuming
a place that has ended. Spec 62 calls it at zero; spec 63 shows the sheet.

No service, entity or API operation: the server's sweeper (every 1 s) releases the admission and the stock on its own
(`architecture/lld-02-core-module.md` line 77: expiry from SELECTION sends no email; FR-18's "notified" is the in-app
sheet), and `openapi.yaml` `joinQueue` already gives a new number at the back after a place ended ("Antre lagi").

Out of scope: any server call to release the slot; the hold and the payment window (FR-21 / FR-23); keeping the countdown
across a refresh (FR-19-W1, rusuh-web#18); the device token (kept: it identifies the browser, not the turn); the session.

## Glossary

| Term            | Definition                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Order window    | The 5 minutes from claiming the turn to creating the hold (ADR-0005); ends at `expiresAt` from `getCategories`      |
| Admission token | The token `claimTurnUseCase` stores in `admissionStore` per event; the order page sends it as `X-Admission-Token`   |
| Stored place    | `StoredQueuePlace` (`queueToken`, `seq`, `joinedServed`) kept per event in `queuePlaceStore` (localStorage)         |
| Resume          | `joinQueueUseCase` reading the stored place back with `getMyPlace` before joining (FR-10)                           |
| Dead place      | A stored place whose turn ended; resuming it answers 410 `EXPIRED`, which the waiting room shows as `missed`        |
| Sweeper         | The queue service job (every 1 s) that releases admissions past their end; the source of truth for the window's end |

## Requirements

### Requirement 1: Forget the ended turn on this device

**User Story:**

AS a buyer whose 5 minutes ran out
I WANT this browser to drop the turn that ended
SO THAT "Antre lagi" puts me at the back of the line at once (Q-26), without a "turn missed" detour

#### Acceptance Criteria

- SHALL export `EndOrderWindowUseCase` from `src/core/use_case/booking/end-order-window.use-case.ts` with
  `execute(eventId: string): EndOrderWindowResult`, where `EndOrderWindowResult = { kind: 'ended' }`
- WHEN `execute(eventId)` runs THEN it SHALL remove the admission token for that event (`admissionStore.set(eventId,
null)`) and the stored place for that event (`queuePlaceStore.remove(eventId)`), and return `{ kind: 'ended' }`
- WHEN the next waiting-room visit runs `joinQueueUseCase.execute(eventId)` THEN it SHALL find no queue token, skip the
  resume, and join (a new number at the back), with no change to `joinQueueUseCase`
- SHALL be synchronous (no `Promise`): both stores are local
- SHALL NOT call a service, `fetch`, or any API operation (the sweeper releases the slot and the stock)
- SHALL NOT touch the device token, the session tokens, or any other event's admission token or stored place

### Requirement 2: Safe to repeat

**User Story:**

AS the order page
I WANT to call the rule without checking what is stored
SO THAT a second call, or a call when nothing is stored, does no harm

#### Acceptance Criteria

- WHEN `execute` runs again for the same event THEN it SHALL return `{ kind: 'ended' }` and leave both stores empty for
  that event
- WHEN nothing is stored for the event (no token, no place: a refresh lost the in-memory token, or another tab already
  ended it) THEN it SHALL return `{ kind: 'ended' }` without error
- SHALL NOT read the stores before writing (no branching on what was there): the outcome is always the same
- WHEN a store throws (e.g. a storage adapter failure) THEN the error SHALL propagate unchanged (no catch)

### Requirement 3: DI, rules and tests

**User Story:**

AS a developer
I WANT the use case wired like the others
SO THAT the order controller can receive it from the container

#### Acceptance Criteria

- SHALL depend only on `Pick<AwilixRegistry, 'queuePlaceStore' | 'admissionStore'>`
- SHALL register `endOrderWindowUseCase: asFunction(EndOrderWindowUseCase).singleton()` in
  `src/infrastructure/di/services.registry.ts` and add `endOrderWindowUseCase: EndOrderWindowUseCaseInterface` to
  `AwilixRegistry` (use cases group), so `di/__tests__/registry.test.ts` still finds a registration for every key
- SHALL NOT import React, Next.js, a browser API, an adapter, or a translation; SHALL NOT return text
- SHALL test with plain object mocks in `src/core/use_case/booking/__tests__/end-order-window.use-case.test.ts`: both
  stores cleared for that event only, other events untouched, the result, idempotence, nothing stored, and error
  propagation; coverage ≥ 85%
