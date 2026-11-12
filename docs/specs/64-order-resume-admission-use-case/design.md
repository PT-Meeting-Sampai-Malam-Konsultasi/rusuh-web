# Design Document

## Overview

`GetOrderCategoriesUseCase` (`src/core/use_case/booking/get-order-categories.use-case.ts`) is extended, not replaced.
When the order page has no admission token (the tab was reloaded or opened fresh: `admissionStore` is memory only) and
this browser has a stored queue place for the event, it **claims the turn again** through `claimTurnUseCase` instead of
answering `admission-invalid` at once, then loads the categories with the token the claim returned. The server answers
the same slot and the same lease end, so `expiresAt` in the categories answer is the one the buyer saw before the reload
and the countdown (spec 59) carries on from the real time left. With no stored place (a browser that never queued, or
cleared storage) it answers `admission-invalid` without a claim, and the waiting room joins as today.

Two result changes: `ok` gains `resumed: boolean` (true when this call claimed; the controller tracks `order_resumed`,
spec 65), and a new member `{ kind: 'window-ended' }` for a claim that ran and said the turn is over (the controller
shows the FR-18 time's-up sheet, spec 65).

**Why claim again, not store the token.** J9.6 (`architecture/sequence-diagrams.md` line 878) keeps `admissionToken` in
memory, "optional on disk": "A new claim returns the same slot, so storing it is optional". `claimTurn` is documented as
safe to repeat (`openapi.yaml` line 789: "a retry … returns the same token") and ADR-0030 line 45: "The same device
after a restart already resumes: the claim is idempotent and returns the same slot and end". `api/tokens.md` (lines
87–88) is more precise: a retried claim returns a **new token for the same slot and `exp`**; either way the client
just uses what the claim returns. `createAdmissionStore` documents "never in storage, cookies or logs; a refresh loses
them". The re-claim costs one request on reload only, and keeps the token off disk.

**Why check the stored place first.** Without a stored place `claimTurnUseCase` has no queue token, so it "forgets" and
answers `missed`, which would become `window-ended` and show "5 menit sudah lewat" to someone who never had 5 minutes
(a shared `/order` link, a cleared browser). Reading `queuePlaceStore.get(eventId)` first sends that buyer to the waiting
room, which joins (today's behaviour). Only a claim that actually ran and answered `missed` means the turn is over. The
read is local (no request) and read-only: the use case never writes the store (`claimTurnUseCase.forget` and
`endOrderWindowUseCase` own the removals).

Consequence for the FR-18 flow: when the time's-up sheet has run on this page, `endOrderWindowUseCase` (spec 61) has
already removed the stored place, so a reload after the sheet answers `admission-invalid` → the waiting room → a new
number at the back (the sheet's own "Antre lagi" outcome). `window-ended` appears when the place is still stored but the
server says the turn is over (e.g. the tab was closed before 0:00 and reopened later).

**Why in this use case.** The decision "no token → is there a place? → claim → classify the claim into an order outcome"
is multi-step orchestration and classification (use-case rule: "Multi-step orchestration", "mapping … status to the next
screen"). Putting it in the controller would need a second query (claim) chained to the categories query and store /
token handling in the controller ("storage, tokens → infrastructure"). Here the controller's single categories query
keeps its key and shape; only the result union grows.

**What it replaces.** Today: reload → `admission-invalid` → `router.replace('/queue?event=…')` → `joinQueueUseCase`
resumes the place → `atTurn` → `claimTurnUseCase.execute` (same slot) → `router.replace('/order?…')`. Between the
resume and the claim, the queue page can show `missed` ("Giliran terlewat") for a moment when `turnWindow` is past, and
`queue_join` / `queue_claim` fire again. After this spec the same claim happens from `/order` directly. The redirect
path stays for every outcome the waiting room must handle (no place, sign-in, retry, paused, sold out, a rejected
token).

**Dependencies.** The rule allows "other use cases from `AwilixRegistry`": `claimTurnUseCase` already owns the token
lookup, the classification of every claim code, the `admissionStore.set` and `forget`. Reusing it keeps one definition
of "claim". No cycle: `ClaimTurnUseCase` depends on `queueService` and three stores, never on a booking use case.
`queuePlaceStore` is a core protocol (`src/core/protocols/queue-place-store.protocol.ts`), not a service: the same rule
tension spec 61 recorded ("depend only on services, config and other use cases"), resolved the same way, following the
queue use cases' precedent (`claim-turn`, `join-queue`, `leave-queue`, `end-order-window` depend on the store
protocols, never on an adapter).

**Difference from J9.5 recorded.** The error table (`sequence-diagrams.md` line 869) says for a core 403
`ADMISSION_INVALID`: "Claim again; if that fails, go back to the waiting room". This spec claims again only when there is
**no** token. A token that exists and is rejected (another device claimed last, or the window ended on the server) stays
`admission-invalid`, and the controller's redirect sends the buyer to the waiting room, which claims again itself. Same
end state, no claim loop inside one query (a rejected re-claimed token would otherwise claim again on every retry).

**Recorded limitation: `MOVED`.** `claimTurnUseCase` folds 410 `MOVED` into `missed`, so a reload after another device
of the same account took the place gives `window-ended`, and the sheet says "5 menit sudah lewat" instead of "moved to
another device". Rare (it needs a second device to take the claimed turn within the same minutes); a follow-up could
carry the code in the `missed` result. Not changed here.

## Architecture

```
orderController (spec 65) ── categories query queryFn ──► getOrderCategoriesUseCase.execute({ eventId, admissionToken })
                                                            │  admissionToken = admissionStore.get(eventId), read at fetch time
                                                            │
     token present ─────────────────────────────────────────┤──► bookingService.getCategories(eventId, token)
                                                            │       200 → { kind: 'ok', …, resumed: false }
                                                            │       403 ADMISSION_INVALID → { kind: 'admission-invalid' }
                                                            │       other → throw
                                                            │
     token null / '' ──► queuePlaceStore.get(eventId)       │  (read only)
                           null ──────────────────────────► { kind: 'admission-invalid' }          (no claim, no request)
                           place ──► claimTurnUseCase.execute(eventId)   (stores the new token in admissionStore itself)
                                       admitted ──────────► bookingService.getCategories(eventId, admission.admissionToken)
                                                               200 → { kind: 'ok', …, resumed: true }
                                                               403 ADMISSION_INVALID → { kind: 'admission-invalid' }
                                                               other → throw
                                       missed                         → { kind: 'window-ended' }
                                       sign-in | retry | paused | sold-out → { kind: 'admission-invalid' }
                                       throws                         → throw
```

API operations: `claimTurn` (queue service, `POST /queue/{eventId}/claim`, through `queueService` inside
`claimTurnUseCase`) and `getCategories` (core, `GET /core/events/{eventId}/categories`). No new operation, service or
entity.

Files:

```
src/core/use_case/booking/get-order-categories.use-case.ts                 changed
src/core/use_case/booking/__tests__/get-order-categories.use-case.test.ts  changed
src/controllers/__tests__/order.controller.test.ts                          + resumed: false on ok fixtures (tsc only)
src/infrastructure/di/services.registry.ts                                  unchanged (Awilix injects the new deps)
src/infrastructure/di/registry.types.ts                                     unchanged
```

DI order: both use cases are registered in `services.registry.ts` with `asFunction(…).singleton()`; `queuePlaceStore`
in `infrastructure.registry.ts`, which runs first. Awilix PROXY mode resolves the deps lazily when
`GetOrderCategoriesUseCase` is first resolved (by the order controller), after `registerAll()` has registered
everything, so the order of the lines in the services registry does not matter.

## Components and Interfaces

```ts
// src/core/use_case/booking/get-order-categories.use-case.ts
import type { Category } from '@core/entities/booking/booking.entity';
import type { Money } from '@core/entities/catalog/catalog.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export interface GetOrderCategoriesInput {
  eventId: string;
  /** From the admission store; null after a reload (memory only). Null or '' → claim again if a place is stored. */
  admissionToken: string | null;
}

export type OrderCategoriesResult =
  | {
      kind: 'ok';
      categories: Category[];
      maxTicketsPerOrder: number;
      /** Units reserved for this admission, 1–3 (ADR-0004). */
      reservedUnits: number;
      adminFee: Money;
      /** End of the 5-minute order window (ADR-0005); the same after a re-claim. Timer: expiresAt − serverNow. */
      expiresAt: string;
      serverNow: string;
      /** True when this call had no token and claimed the turn again (a reload), for analytics (FR-19-W1). */
      resumed: boolean;
    }
  /**
   * No live admission the order page can use: the waiting room takes over (no stored place, sign in, wait, sold out,
   * rejected token).
   */
  | { kind: 'admission-invalid' }
  /** A re-claim ran and said the turn is over (MISSED / EXPIRED, and MOVED: see the design): time's up (FR-18). */
  | { kind: 'window-ended' };

export interface GetOrderCategoriesUseCaseInterface {
  execute: (input: GetOrderCategoriesInput) => Promise<OrderCategoriesResult>;
}

type Deps = Pick<AwilixRegistry, 'bookingService' | 'claimTurnUseCase' | 'queuePlaceStore'>;

/** The HTTP adapter rejects with a plain HttpError object, so the check is structural. */
const isAdmissionInvalid = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as HttpError).code === 'ADMISSION_INVALID';

export const GetOrderCategoriesUseCase = ({
  bookingService,
  claimTurnUseCase,
  queuePlaceStore,
}: Deps): GetOrderCategoriesUseCaseInterface => {
  /** One categories call with this token; a rejected token is an outcome, never a reason to claim. */
  const load = async (eventId: string, token: string, resumed: boolean): Promise<OrderCategoriesResult> => {
    try {
      const { data } = await bookingService.getCategories(eventId, token);
      return {
        kind: 'ok',
        categories: data.categories,
        maxTicketsPerOrder: data.maxTicketsPerOrder,
        reservedUnits: data.reservedUnits,
        adminFee: data.adminFee,
        expiresAt: data.expiresAt,
        serverNow: data.serverNow,
        resumed,
      };
    } catch (error) {
      if (isAdmissionInvalid(error)) return { kind: 'admission-invalid' };
      throw error;
    }
  };

  return {
    execute: async ({ eventId, admissionToken }) => {
      if (admissionToken) return load(eventId, admissionToken, false);
      // Never queued here (or storage cleared): not a time's-up; the waiting room joins (read only, no request).
      if (!queuePlaceStore.get(eventId)) return { kind: 'admission-invalid' };
      // FR-19-W1: a reload lost the in-memory token. The claim is idempotent (same slot, same lease end) and stores
      // the token in admissionStore itself; a thrown claim error propagates.
      const claim = await claimTurnUseCase.execute(eventId);
      if (claim.kind === 'admitted') return load(eventId, claim.admission.admissionToken, true);
      if (claim.kind === 'missed') return { kind: 'window-ended' };
      return { kind: 'admission-invalid' }; // sign-in, retry, paused, sold-out: the waiting room handles them
    },
  };
};
```

`load` is a closure inside the factory (as `tokensFor` / `forget` in `ClaimTurnUseCase`), not module state.

Compile check against `AwilixRegistry`:

- `queuePlaceStore: QueuePlaceStoreProtocol` exists with `get(eventId: string): StoredQueuePlace | null`; only `get` is
  called.
- `claimTurnUseCase: ClaimTurnUseCaseInterface` exists; `execute(eventId: string, jitter?: number):
Promise<ClaimTurnResult>`; `ClaimTurnResult` `admitted` has `admission: Admission` with `admissionToken: string`.
- The final `return { kind: 'admission-invalid' }` is reached for `sign-in | retry | paused | sold-out`; TypeScript
  narrows `claim` there, and an exhaustive `switch` with `never` is an acceptable alternative for the writer.
- `bookingService.getCategories(eventId: string, admissionToken: string)` unchanged.
- The controller (spec 65) reads `categoriesData?.kind === 'ok'`; the new member makes the union wider, so the controller
  compiles unchanged (the `window-ended` handling is spec 65). Its test fixtures typed `OrderCategoriesResult` need
  `resumed: false` (task 3) or `tsc` fails on the missing required field.

## Data Models

| Input token   | Stored place | Claim answer                   | `getCategories`         | Result                             | Claims | Category calls |
| ------------- | ------------ | ------------------------------ | ----------------------- | ---------------------------------- | ------ | -------------- |
| `'adm_1'`     | (not read)   | —                              | 200                     | `ok`, `resumed: false`             | 0      | 1              |
| `'adm_1'`     | (not read)   | —                              | 403 `ADMISSION_INVALID` | `admission-invalid`                | 0      | 1              |
| `'adm_1'`     | (not read)   | —                              | other error             | throws                             | 0      | 1              |
| `null` / `''` | none         | —                              | —                       | `admission-invalid`                | 0      | 0              |
| `null` / `''` | yes          | `admitted` (token `adm_2`)     | 200 (with `adm_2`)      | `ok`, `resumed: true`              | 1      | 1              |
| `null` / `''` | yes          | `admitted`                     | 403 `ADMISSION_INVALID` | `admission-invalid` (no 2nd claim) | 1      | 1              |
| `null` / `''` | yes          | `admitted`                     | other error             | throws                             | 1      | 1              |
| `null` / `''` | yes          | `missed`                       | —                       | `window-ended`                     | 1      | 0              |
| `null` / `''` | yes          | `sign-in` / `retry` / `paused` | —                       | `admission-invalid`                | 1      | 0              |
| `null` / `''` | yes          | `sold-out`                     | —                       | `admission-invalid`                | 1      | 0              |
| `null` / `''` | yes          | throws                         | —                       | throws (same error)                | 1      | 0              |

State: this use case reads `queuePlaceStore.get(eventId)` and writes nothing. Through `claimTurnUseCase` only:
`admissionStore.set(eventId, token)` on `admitted`; `queuePlaceStore.remove(eventId)` on `missed` (its `forget`).

`expiresAt` after a re-claim: the lease end of the slot, unchanged by the claim (`tokens.md`: "a retried `claimTurn`
returns a new token for the **same** `slot` and `exp`"; core's Detail countdown is the lease end). So a buyer who
reloads at 2:12 left gets an answer whose `expiresAt − serverNow` is about 132 s, not 300 s.

## Layer Constraints

From `.claude/rules/core-use-case.md`:

- `src/core/use_case/{domain}/{action}.use-case.ts`
- Depend only on services, config and other use cases from `AwilixRegistry`
- Zero React, zero Next.js, zero hooks, zero browser APIs
- Multi-step orchestration (check → validate → transform → decide)
- Business rules and validation, for example:
  - remaining time from `expiresAt − serverNow`
  - mapping booking/payment status to the next screen
- Transforming API responses into domain models
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

Notes: the claim dependency is another use case (allowed); `queuePlaceStore` is a core protocol, read only, following
the queue use cases' precedent (Overview; same tension as spec 61). Only `ADMISSION_INVALID` is caught here; the claim's
codes are classified by `claimTurnUseCase` and arrive as results. `resumed` is a fact for the controller's analytics; the
use case tracks nothing. The remaining time is not computed here (spec 59's controller does it).

From `.claude/rules/scaffold.md`:

- Services and use cases: `asFunction(Factory).singleton()`
- `AwilixRegistry` (`src/infrastructure/di/registry.types.ts`) is the single source of truth. **Every key in it has a
  `container.register()` call** in one of the three registries or a `di/controllers/` file. Awilix resolves at
  runtime, so TypeScript will not catch a missing registration. Count keys vs registrations after every change.

From `CLAUDE.md`:

- Countdowns use server time: `expiresAt − serverNow` from the API, never the device clock.
- Errors from the API carry a stable `code`; map it to a translation key, never show raw messages.

From `src/infrastructure/adapters/admission-store.adapter.ts` (the adapter's contract, which this spec keeps):

- Keeps admission tokens in memory only (never in storage, cookies or logs); a refresh loses them.

## Correctness Properties

- Property 1: with `admissionToken: 'adm_1'` and `getCategories` resolving, the result is the `ok` mapping of specs
  13 / 46 plus `resumed: false`; `claimTurnUseCase.execute` and `queuePlaceStore.get` are not called; `getCategories`
  is called once with `('evt_1', 'adm_1')`. **Validates: Requirements 2, 4, 5**
- Property 2: with `admissionToken` `null` and `''` (it.each), `queuePlaceStore.get` returning a place,
  `claimTurnUseCase.execute` resolving `{ kind: 'admitted', admission: { admissionToken: 'adm_2', … } }` and
  `getCategories` resolving, the result is `ok` with `resumed: true`; `queuePlaceStore.get` is called with `'evt_1'`;
  `claimTurnUseCase.execute` once with `'evt_1'`; `getCategories` once with `('evt_1', 'adm_2')`, and the claim is
  called before it (`mock.invocationCallOrder`). **Validates: Requirements 1**
- Property 3: in Property 2, `expiresAt` and `serverNow` equal the service response's (`'2026-11-09T03:02:12Z'` /
  `'2026-11-09T03:00:00Z'` → 132 s), untouched. **Validates: Requirements 1**
- Property 4: with `admissionToken` `null` and `''` (it.each) and `queuePlaceStore.get` returning `null`, the result is
  `{ kind: 'admission-invalid' }`; neither `claimTurnUseCase.execute` nor `getCategories` is called.
  **Validates: Requirements 2**
- Property 5: with a stored place, a claim answering `missed` gives `{ kind: 'window-ended' }` and no `getCategories`
  call. **Validates: Requirements 3**
- Property 6: with a stored place, claims answering `sign-in`, `{ kind: 'retry', afterMs: 1000 }`, `paused`, `sold-out`
  (it.each) each give `{ kind: 'admission-invalid' }` and no `getCategories` call. **Validates: Requirements 3**
- Property 7: with a stored place, a claim rejecting with `{ status: 503, code: 'ADMISSION_UNAVAILABLE' }`,
  `{ status: 0, code: 'NETWORK_ERROR' }` and `new Error('boom')` (it.each) makes `execute` reject with the same value;
  no `getCategories` call. **Validates: Requirements 3**
- Property 8: after a re-claim, `getCategories` rejecting with `ADMISSION_INVALID` gives `admission-invalid` and
  `claimTurnUseCase.execute` has been called exactly once (no second claim). **Validates: Requirements 1, 4**
- Property 9: with a non-empty token rejected with `ADMISSION_INVALID`, the result is `admission-invalid` and
  `claimTurnUseCase.execute` is never called. **Validates: Requirements 4**
- Property 10: the existing "re-throws unclassified errors unchanged" cases still pass with a token, and the same list
  rejects unchanged after a successful re-claim. **Validates: Requirements 4**
- Property 11: no module state: two calls (first `null` with a place → claim → ok, then `'adm_3'` → ok) give
  `resumed: true` then `resumed: false`, with one claim in total. **Validates: Requirements 4, 5**
- Property 12: the use case reads `queuePlaceStore` and never writes it: across every test the mock's `set` and
  `remove` are never called (the claim mock is a plain object, so any removal would come from this use case); it has no
  `admissionStore` dependency (the token reaches it only through `claimTurnUseCase`);
  `container.resolve('getOrderCategoriesUseCase')` after `registerAll()` still returns an object with `execute`
  (registry test). **Validates: Requirements 1, 2, 5**

## Error Handling

`claimTurn` (through `claimTurnUseCase`, only when there is no token and a place is stored):

| Code (status)                                                                       | `claimTurnUseCase` result                           | This use case       | What the user sees (spec 65)                         |
| ----------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------- | ---------------------------------------------------- |
| (no stored place: no claim)                                                         | —                                                   | `admission-invalid` | redirect to `/queue`, which joins                    |
| 200                                                                                 | `admitted`                                          | categories call     | the order page, countdown from the real time left    |
| `UNAUTHORIZED` (401, after the adapter's refresh)                                   | `sign-in`                                           | `admission-invalid` | redirect to `/queue`, which sends to sign-in         |
| `NOT_YET`, `FULL` (409)                                                             | `retry`                                             | `admission-invalid` | redirect to `/queue`, which retries the claim        |
| `NO_STOCK` (409)                                                                    | `paused`                                            | `admission-invalid` | redirect to `/queue` (paused)                        |
| `QUEUE_CLOSED` (410)                                                                | `sold-out`                                          | `admission-invalid` | redirect to `/queue` (sold out)                      |
| `MISSED`, `EXPIRED`, `MOVED` (410); no device token                                 | `missed` (place forgotten)                          | `window-ended`      | the FR-18 time's-up sheet                            |
| `ADMISSION_UNAVAILABLE` (503), other 5xx                                            | throws                                              | throws              | error state + "Coba lagi" (query retries once first) |
| `NETWORK_ERROR`, `TIMEOUT`                                                          | throws                                              | throws              | error state / offline banner                         |
| `LOGIN_REQUIRED` (401), `ACCOUNT_HAS_PLACE_ELSEWHERE` (409), `NOT_FOUND` (404), 429 | throws (not classified by `claimTurnUseCase` today) | throws              | error state + "Coba lagi"                            |

`getCategories` (with either token): 200 → `ok`; 403 `ADMISSION_INVALID` → `admission-invalid`; 401 `UNAUTHORIZED`,
5xx `INTERNAL_ERROR`, `NETWORK_ERROR`, `TIMEOUT`, anything else → throws, as today.

Notes:

- `LOGIN_REQUIRED` / `ACCOUNT_HAS_PLACE_ELSEWHERE` are not classified by `claimTurnUseCase` (FR-08 scope); the waiting
  room has the same gap. Not changed here.
- `MOVED` → `window-ended`: recorded limitation (Overview).
- A stored place with no device token (storage partly cleared) still claims, and `claimTurnUseCase` answers `missed`
  → `window-ended`. Not expected in practice (both live in the same storage); accepted.
- Mock mode: `admissionStore.get` returns `MOCK_ADMISSION_TOKEN` when nothing is stored, so the no-token branches never
  run under `NEXT_PUBLIC_API_MOCK=true`; they are covered by the unit tests (spec 66 records this).

## Testing Strategy

`src/core/use_case/booking/__tests__/get-order-categories.use-case.test.ts`:

- `setup()` gains `claimTurnUseCase = { execute: vi.fn(), turnWindow: vi.fn() }` and `queuePlaceStore = { get:
vi.fn().mockReturnValue(place), set: vi.fn(), remove: vi.fn() }` with `place = { queueToken: 'q_1', seq: 19700,
joinedServed: 18452 }` (shape of `StoredQueuePlace`); `GetOrderCategoriesUseCase({ bookingService, claimTurnUseCase,
queuePlaceStore })`.
- `admission(token = 'adm_2')`: `{ admissionToken: token, slotId: 's_1', maxTickets: 3, expiresAt:
'2026-11-09T03:05:00Z', serverNow: '2026-11-09T03:00:00Z' }`.
- Replace the test "returns admission-invalid without a request when the token is %j": the same it.each now asserts
  the claim with a stored place (Property 2) and `admission-invalid` without one (Property 4).
- One `it` / `it.each` per Property 1–11; Property 12 as an `afterEach` assertion on `set` / `remove` plus the existing
  `src/infrastructure/di/__tests__/registry.test.ts`.
- Update the existing `ok` expectation with `resumed: false`.
- `src/controllers/__tests__/order.controller.test.ts`: `okResult` gains `resumed: false` (its spreads inherit it).
- Gate: `npx tsc --noEmit && npx vitest --run`; coverage ≥ 85% for the file.
