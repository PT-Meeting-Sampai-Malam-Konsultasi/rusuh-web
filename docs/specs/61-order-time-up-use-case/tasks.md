# Implementation Plan: Order time's up (use case)

## Overview

Add `endOrderWindowUseCase`: when the 5-minute order window has ended (FR-18, Q-26), this device forgets the event's
admission token and its stored queue place, so "Antre lagi" joins at the back at once instead of resuming a dead place
and landing on the `missed` screen. Synchronous, no API call (the queue's sweeper releases the slot and the stock),
always `{ kind: 'ended' }`, safe to repeat. Writer: use-case-writer. Spec 62 calls it on the first expiry; spec 63 shows
the sheet.

## Tasks

- [x] 1. Create `src/core/use_case/booking/end-order-window.use-case.ts`: `EndOrderWindowResult`, `EndOrderWindowUseCaseInterface` and the `EndOrderWindowUseCase` factory (deps `queuePlaceStore`, `admissionStore`; `admissionStore.set(eventId, null)`, `queuePlaceStore.remove(eventId)`, return `{ kind: 'ended' }`; no read, no catch, type-only imports) [Requirement 1, Requirement 2]
- [x] 2. Register `endOrderWindowUseCase: asFunction(EndOrderWindowUseCase).singleton()` in `src/infrastructure/di/services.registry.ts` and add `endOrderWindowUseCase: EndOrderWindowUseCaseInterface` to `AwilixRegistry` in `src/infrastructure/di/registry.types.ts` (use cases group) [Requirement 3]
- [x] 3. Write `src/core/use_case/booking/__tests__/end-order-window.use-case.test.ts` with in-memory store fakes: both stores cleared for that event, other events untouched, synchronous result, idempotent, nothing stored, no `get` calls, store error propagates [Requirement 1, Requirement 2, Requirement 3]
- [x] 4. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2, 3], [4]] }
```

## Notes

- Gate: `npx tsc --noEmit && npx vitest --run`; `src/infrastructure/di/__tests__/registry.test.ts` must still pass
  (one registration per `AwilixRegistry` key). Coverage ≥ 85%.
- Do not change `joinQueueUseCase`: with no stored queue token its resume returns null and it joins (new number at the
  back). That is the whole point of clearing the place.
- Do not touch `deviceTokenStore` or the session: the device token identifies the browser and is reused by the next
  join; signing out is not part of an expired order window.
- No service, entity or API operation, and no `Promise`. The use case returns no text and tracks no analytics (the
  controller tracks `order_time_up`, spec 62).
- Rule tension recorded in the design: use cases "depend only on services, config and other use cases", but the queue
  use cases already depend on the store protocols; this follows them.
- Accepted race: the server sweeper can lag the client's zero by up to ~1 s; a rejoin inside it may get the old place
  back. Not handled (spec 62).
- Out of scope: the countdown across a refresh (FR-19-W1, rusuh-web#18), the payment window (FR-21 / FR-23), the hold,
  any release call.
- Commit: `feat(order): [FR-18-W1] forget the place when the order window ends`.
