# Design Document

## Overview

One new use case, `endOrderWindowUseCase` (`src/core/use_case/booking/end-order-window.use-case.ts`): when the order
window has ended, this device forgets the dead admission token and the stored queue place for that event. Two store
writes, no API call, synchronous, always `{ kind: 'ended' }`.

**Why it is needed.** Today `joinQueueUseCase` resumes the stored place on every waiting-room visit (FR-10): with the
queue token still stored, "Antre lagi" from the order page would call `getMyPlace`, get 410 `EXPIRED` (the turn ended),
and show the `missed` screen, which asks for a second "Antre lagi" click before the buyer gets a new number. Q-26 says
the buyer queues again at the back; the sheet already told them their place went to the next number. Removing the stored
place makes the next visit join at once. Removing the admission token stops the order page (or a later visit to it)
sending a token the server has already released.

**Why a use case and not two lines in the controller.**

- It is a business rule: "an order window that ended ends the place for good; the next join is at the back" (A-10 /
  Q-26, customer journey T1). The use-case rule lists "mapping booking/payment status to the next screen" and
  "classifying … into business outcomes" as use-case work, and the queue use cases already own the same decision for a
  missed or left turn (`claimTurnUseCase.forget`, `leaveQueueUseCase`).
- The controller rule sends "storage, tokens" out of the controller, and the controller never touches
  `queuePlaceStore` today (the brief: controllers never touch it directly). `orderController` only reads
  `admissionStore` to send the token.
- The use-case rule's anti-pattern "a use case that only forwards one service call" does not apply: there is no service
  call; the use case is the single place that defines what "ended" clears.

**Rule tension recorded.** `.claude/rules/core-use-case.md` says use cases "depend only on services, config and other
use cases". The existing queue use cases (`claim-turn`, `leave-queue`, `join-queue`, `follow-queue`) depend on the
`queuePlaceStore` / `admissionStore` protocols (pure interfaces in `src/core/protocols/`, implemented in
infrastructure), so this spec follows that precedent: the dependency is on core protocols, never on an adapter.

**Why no server call.** The sweeper releases admissions past their end every second, and the API has no "release my
admission" operation; `openapi.yaml` `joinQueue` documents that joining again after "claimed and its time ran out" gives
a new number at the back. A client call would add load at the worst moment (a whole wave ends together) for nothing.

**Why synchronous.** Both stores are local (in-memory map and localStorage through the storage adapter). Returning a
`Promise` would force the controller into a mutation for a call that cannot fail on the network. The use-case rule asks
for a typed result union; one member is enough here and keeps the shape of `LeaveQueueResult` (`{ kind: 'left' }`).

## Architecture

```
orderController (spec 62) ── on the first expiry, once ──► endOrderWindowUseCase.execute(eventId)
                                                              ├─ admissionStore.set(eventId, null)
                                                              ├─ queuePlaceStore.remove(eventId)
                                                              └─ return { kind: 'ended' }

"Antre lagi" → /queue?event=<id> → queueController → joinQueueUseCase.execute(eventId)
                                                       resume(): no queueToken → null → joinWithDevice → new number
```

API operations: none. The next `joinQueue` (spec of FR-04, unchanged) is what gives the new number.

Files:

```
src/core/use_case/booking/end-order-window.use-case.ts                 new
src/core/use_case/booking/__tests__/end-order-window.use-case.test.ts  new
src/infrastructure/di/services.registry.ts                             + endOrderWindowUseCase
src/infrastructure/di/registry.types.ts                                + endOrderWindowUseCase in AwilixRegistry
```

Domain folder `booking`: the order window belongs to the order flow (`get-order-categories`, `validate-attendee`), even
though the stores it clears were filled by the queue flow.

## Components and Interfaces

```ts
// src/core/use_case/booking/end-order-window.use-case.ts
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export type EndOrderWindowResult = { kind: 'ended' };

export interface EndOrderWindowUseCaseInterface {
  /**
   * FR-18: the order window ran out before a hold. Forgets this event's admission token and stored queue place, so
   * the next waiting-room visit joins at the back (Q-26) instead of resuming a place that has ended.
   */
  execute: (eventId: string) => EndOrderWindowResult;
}

type Deps = Pick<AwilixRegistry, 'queuePlaceStore' | 'admissionStore'>;

/**
 * No API call: the queue's sweeper releases the admission and the stock (every 1 s), and joining again after an ended
 * place gives a new number at the back (openapi joinQueue). Safe to repeat.
 */
export const EndOrderWindowUseCase = ({ queuePlaceStore, admissionStore }: Deps): EndOrderWindowUseCaseInterface => ({
  execute: (eventId) => {
    admissionStore.set(eventId, null);
    queuePlaceStore.remove(eventId);
    return { kind: 'ended' };
  },
});
```

```ts
// src/infrastructure/di/registry.types.ts (additions)
import type { EndOrderWindowUseCaseInterface } from '@core/use_case/booking/end-order-window.use-case';
// in AwilixRegistry, use cases group, after validateAttendeeUseCase:
endOrderWindowUseCase: EndOrderWindowUseCaseInterface;

// src/infrastructure/di/services.registry.ts (additions)
import { EndOrderWindowUseCase } from '@core/use_case/booking/end-order-window.use-case';
endOrderWindowUseCase: asFunction(EndOrderWindowUseCase).singleton(),
```

Compile check against `AwilixRegistry`: `admissionStore: AdmissionStoreProtocol` has `set(eventId: string, token:
string | null): void` ("null removes"); `queuePlaceStore: QueuePlaceStoreProtocol` has `remove(eventId: string): void`.
Both keys are registered in `infrastructure.registry.ts`, which runs before `services.registry.ts`, so the new
registration only depends on earlier registries. The type import of `registry.types` from a use case is the pattern of
every existing use case (a type-only cycle, no runtime import).

## Data Models

- Input: `eventId: string` (the `event` search param of `/order`, non-empty: spec 62 only calls it when status is
  `ready`, which needs an event id).
- Result: `EndOrderWindowResult = { kind: 'ended' }`.
- State touched, per event only:

| Store              | Key                                  | Before             | After        |
| ------------------ | ------------------------------------ | ------------------ | ------------ |
| `admissionStore`   | in-memory map, `eventId`             | admission token    | none (null)  |
| `queuePlaceStore`  | localStorage `rusuh.queue.<eventId>` | `StoredQueuePlace` | removed      |
| `deviceTokenStore` | (not touched)                        | device token       | device token |
| `tokenStore`       | (not touched)                        | session            | session      |

Order of the writes: admission first, then the place. Neither depends on the other; the admission token is the one the
order page could still send, so it goes first.

## Layer Constraints

From `.claude/rules/core-use-case.md`:

- `src/core/use_case/{domain}/{action}.use-case.ts`
- Depend only on services, config and other use cases from `AwilixRegistry`
- Zero React, zero Next.js, zero hooks, zero browser APIs
- Multi-step orchestration (check → validate → transform → decide)
- Business rules and validation, for example:
  - mapping booking/payment status to the next screen
- Classifying expected API errors into business outcomes
- React state, TanStack Query, navigation, analytics, `t()`, user-facing strings, loading overlays, popups
- Return **typed discriminated unions**; never throw for an expected business outcome
- Catch only the specific `HttpError` codes you classify; re-throw everything else for the controller.
- Return codes, never sentences: the controller maps codes to translation keys.
- Stateless; registered as `asFunction(UseCase).singleton()`; interface added to `AwilixRegistry`.
- `src/core/use_case/{domain}/__tests__/{action}.use-case.test.ts`
- Plain object mocks, every business branch, and one test that infrastructure errors propagate.
- Coverage threshold 85%.
- ❌ React or Next.js imports
- ❌ User-facing strings
- ❌ Catching all errors
- ❌ Navigation, analytics or translation calls
- ❌ Module-level mutable state
- ❌ A use case that only forwards one service call
- ❌ Throwing for an expected outcome

Notes: the "depend only on services, config and other use cases" line is read with the queue use cases' precedent (core
protocols for stores; Overview). Nothing is caught, so nothing beyond the result is classified. Analytics for the
expiry (`order_time_up`) is tracked by the controller, not here.

From `.claude/rules/scaffold.md`:

- Services and use cases: `asFunction(Factory).singleton()`
- `AwilixRegistry` (`src/infrastructure/di/registry.types.ts`) is the single source of truth. **Every key in it has a
  `container.register()` call** in one of the three registries or a `di/controllers/` file. Awilix resolves at
  runtime, so TypeScript will not catch a missing registration. Count keys vs registrations after every change.

From `.claude/skills/add-feature/reference/add-use-case.md`:

1. `src/core/use_case/{domain}/{action}.use-case.ts`: result union, interface, factory.
2. `src/core/use_case/{domain}/__tests__/{action}.use-case.test.ts`: every branch + error propagation.
3. Register in `services.registry.ts` as `.singleton()`; add to `AwilixRegistry`.

## Correctness Properties

- Property 1: with `admissionStore` holding `evt_samudra → 'adm_1'` and `queuePlaceStore` holding a place for
  `evt_samudra`, `execute('evt_samudra')` returns `{ kind: 'ended' }`, calls `admissionStore.set('evt_samudra', null)`
  once and `queuePlaceStore.remove('evt_samudra')` once. **Validates: Requirements 1**
- Property 2: with the same stores also holding `evt_pelita`, after `execute('evt_samudra')` the `evt_pelita` token and
  place are unchanged (assert with in-memory fakes, not only call lists). **Validates: Requirements 1**
- Property 3: the result is not a `Promise` (`execute(…)` is a plain object; `expect(result).toEqual({ kind: 'ended' })`
  without `await`). **Validates: Requirements 1**
- Property 4: calling `execute` twice for the same event returns `{ kind: 'ended' }` both times and leaves the stores
  empty for it; calling it with nothing stored returns `{ kind: 'ended' }` and throws nothing. **Validates: Requirements 2**
- Property 5: the use case never calls `get` on either store (`get` mocks not called). **Validates: Requirements 2**
- Property 6: when `queuePlaceStore.remove` throws `new Error('storage')`, `execute` throws that same error.
  **Validates: Requirements 2**
- Property 7: the file imports nothing at runtime (only `import type`); `container.resolve('endOrderWindowUseCase')`
  after `registerAll()` returns an object with `execute`; the registry test passes. **Validates: Requirements 3**
- Property 8 (integration with the existing join): with a fresh `JoinQueueUseCase` over the same in-memory
  `queuePlaceStore` fake, after `execute(eventId)` a join calls `queueService.joinQueue` and not `getMyPlace` (the
  resume is skipped). Covered by reading `join-queue.use-case.ts`; asserted in this file only if cheap.
  **Validates: Requirements 1**

## Error Handling

No API operation, so no API error code. The only failures are the stores':

| Source                                     | Outcome                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `admissionStore.set` (in-memory)           | cannot fail in practice; would propagate                                                   |
| `queuePlaceStore.remove` (storage adapter) | propagates unchanged; spec 62 calls it in an effect, so the sheet still shows (React logs) |

What the server does at the same time (no client handling needed here): the sweeper releases the admission; any later
order call with the old token answers 403 `ADMISSION_INVALID`, which `orderController` already turns into a redirect
(and which spec 62 blocks behind the sheet). The next `joinQueue` can answer 410 `QUEUE_CLOSED` (sold out), 409
`ACCOUNT_HAS_PLACE_ELSEWHERE`, `NOT_FOUND`: all classified by `joinQueueUseCase` as today.

Accepted race (spec 62 records it too): the sweeper may lag the client's zero by up to about a second. A rejoin inside
that second may find the old place still live on the server; not handled.

## Testing Strategy

`src/core/use_case/booking/__tests__/end-order-window.use-case.test.ts`:

- In-memory fakes built from the protocols: `admissionStore` (`Map`, `get` / `set` with `null` deleting) and
  `queuePlaceStore` (`Map`, `get` / `set` / `remove`), with `vi.fn` wrappers to assert calls.
- One `it` per Property 1–6; Property 7 is the existing `src/infrastructure/di/__tests__/registry.test.ts` (no new
  test needed beyond it passing). Property 8 optional.
- No timers, no React, no network.
- Gate: `npx tsc --noEmit && npx vitest --run`; coverage ≥ 85% for the file (it has one path).
