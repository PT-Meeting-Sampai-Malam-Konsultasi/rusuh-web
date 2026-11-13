# Design Document

## Overview

Two parts, neither of them new UI:

1. **Page shell: confirm, test.** `src/presentation/pages/Order/index.tsx` renders
   `{timeUpSheet && <OrderTimeUpSheet sheet={timeUpSheet} />}` after `</main>` (spec 63), outside every `status`
   branch, so the sheet of spec 65's `window-ended` path shows over the skeleton (`status` `'loading'`) and over the
   error message. No code change; one shell test pins it. A resumed answer renders exactly like a first load.
2. **Mock API: the order window follows the claim.** Today the mock `getCategories` answers a fresh window on every
   request (`expiresAt = now + window`), so a reload or a language switch restarts the mock count (spec 60's caveat).
   The real server answers the slot's lease end every time (`tokens.md` lines 40–43, 87–88). The mock now answers
   `admittedAt + window` of the latest admitted mock place for the event, and the mock queue ends an admitted place once
   its window is over (410 `EXPIRED` on claim / read, a new number on rejoin), as the API documents.

No copy change here: the `ADMISSION_UNAVAILABLE` message is spec 65 (the commit where the order page first surfaces claim
errors).

**The fallback token stays.** In mock mode `createAdmissionStore({ fallbackToken: MOCK_ADMISSION_TOKEN })` makes
`admissionStore.get` never null, so a reload in mock mode does **not** run spec 64's no-token branches (stored-place
check, re-claim): the categories call goes out with the fallback token and the mock answers from the admitted place
(part 2), which gives the same visible result (the countdown continues). Removing the fallback would exercise the
re-claim in the mock, but would change opening `/order?event=…&mock=…` directly (the specs 60 and 63 manual checks and
QA's habit): with no stored place spec 64 answers `admission-invalid` and the page redirects to the waiting room. Not
worth it; the branches are covered by spec 64's unit tests and spec 65's controller tests.

**Spec 60 caveat.** With an admitted mock place, a language switch now keeps the same `expiresAt`. Opening `/order`
directly (no admitted place) still gets `now + window` per request, so the caveat remains for that path only.

## Architecture

```
src/app/order/page.tsx                                              unchanged
src/presentation/pages/Order/index.tsx (+ sections)                 unchanged
src/presentation/pages/Order/__tests__/index.test.tsx               + sheet over loading / error

src/infrastructure/mocks/handlers/mock-queue-state.ts               new: state, persistence, window constants, lastAdmittedAt
src/infrastructure/mocks/handlers/handlers.ts                       one shared state per createHandlers call
src/infrastructure/mocks/handlers/shared.ts                         + MockHandlerContext
src/infrastructure/mocks/handlers/queue.handlers.ts                 state from the context; ended admitted places
src/infrastructure/mocks/handlers/booking.handlers.ts               getCategories window from the claim
src/infrastructure/mocks/__tests__/order-window.handlers.test.ts    new
src/infrastructure/mocks/__tests__/booking.handlers.test.ts         import MOCK_SHORT_ORDER_WINDOW_MS from its new home
```

Mock data flow (one browser, `?mock=short_window`):

```
/queue → join (place) → turn → claim: place.admittedAt ??= now; persist (localStorage rusuh.mock.queue)
/order → getCategories(fallback or claimed token)
         admittedAt = state.lastAdmittedAt(eventId)            (latest, live: now − admittedAt < ADMISSION_MS)
         expiresAt  = (admittedAt ?? now) + orderWindowMs(scenario); serverNow = now
reload → same admittedAt → same expiresAt → countdown continues (e.g. 0:39, not 1:15)
after 0:00 → expiresAt < serverNow → 200 as is → time's-up sheet at once (spec 62 / 65)
"Antre lagi" → join → place ended (now ≥ admittedAt + window) → new number at the back
```

## Components and Interfaces

```ts
// src/infrastructure/mocks/handlers/mock-queue-state.ts (new; moved out of queue.handlers.ts)
import type { MockScenario } from '../scenario';

export const ORDER_WINDOW_MS = 5 * 60_000;
/** `?mock=short_window`: 15 s of the ink timer, pink from 1:00, then 0:00. */
export const MOCK_SHORT_ORDER_WINDOW_MS = 75_000;
/** Admission TTL: 60 s claim + 5 min order + 10 min payment (ADR-0021). */
export const ADMISSION_MS = 16 * 60_000;

/** The order window for the current scenario: the same on the queue (place ends) and the booking (expiresAt) side. */
export const orderWindowMs = (scenario: MockScenario) =>
  scenario === 'short_window' ? MOCK_SHORT_ORDER_WINDOW_MS : ORDER_WINDOW_MS;

export interface MockPlace {
  seq: number | null;
  joinedAt: number;
  opensAt: number | null;
  /** Set by the first claim; a repeat returns the same admission. */
  admittedAt?: number;
}

export interface MockQueue {
  opensAt: number | null;
  startedAt: number | null;
  placement?: string;
}

/** The mock queue service's data: one per createHandlers call, kept in localStorage `rusuh.mock.queue` (as today). */
export interface MockQueueState {
  /** Key `${deviceToken}|${eventId}`. */
  places: Map<string, MockPlace>;
  nextSeq: Map<string, number>;
  queues: Map<string, MockQueue>;
  /** Devices registered so far (names the mock device tokens). */
  devices: number;
  persist: () => void;
  /** The latest `admittedAt` among this event's places, or null when none was claimed. */
  lastAdmittedAt: (eventId: string) => number | null;
}

export function createMockQueueState(): MockQueueState;
```

```ts
// src/infrastructure/mocks/handlers/shared.ts (addition)
import type { MockQueueState } from './mock-queue-state';

/** What each handler factory receives: the caller's context plus the state the queue and booking mocks share. */
export interface MockHandlerContext extends MockContext {
  queueState: MockQueueState;
}
```

```ts
// src/infrastructure/mocks/handlers/handlers.ts
const HANDLER_FACTORIES: Array<(context: MockHandlerContext) => HttpHandler[]> = [
  catalogHandlers, // still typed (context: MockContext): assignable, MockHandlerContext extends MockContext
  queueHandlers,
  authHandlers,
  bookingHandlers,
];

/** One mock queue state per call: `server.resetHandlers(...createHandlers(…))` in tests starts a fresh queue. */
export const createHandlers = (context: MockContext) => {
  const shared: MockHandlerContext = { ...context, queueState: createMockQueueState() };
  return HANDLER_FACTORIES.flatMap((factory) => factory(shared));
};
```

`MockContext` and the `createHandlers(context)` signature are unchanged, so `browser.ts` and every test that builds
handlers keep compiling.

```ts
// src/infrastructure/mocks/handlers/queue.handlers.ts (changes)
export function queueHandlers({ queueApiUrl, getScenario, now, queueState }: MockHandlerContext): HttpHandler[] {
  const { places, nextSeq, queues, persist } = queueState; // devices: read and write queueState.devices

  /** An admitted place whose order window is over: its turn is used up (410 EXPIRED; rejoin at the back). */
  const ended = (place: MockPlace, time: number) =>
    place.admittedAt !== undefined && time >= place.admittedAt + orderWindowMs(getScenario());
  // join:   if (place && (missed(eventId, place, time) || ended(place, time))) place = undefined;
  // claim / GET me: if (ended(place, time)) { places.delete(key); persist(); return problem(410, 'EXPIRED', 'Waktu Anda sudah habis'); }
  //                 (before the existing missed check, which needs admittedAt undefined anyway)
  // claim admission expiresAt: unchanged (admittedAt + ADMISSION_MS)
}
```

```ts
// src/infrastructure/mocks/handlers/booking.handlers.ts (getCategories, changes only)
const time = today.getTime();
const windowMs = orderWindowMs(scenario);
const admittedAt = queueState.lastAdmittedAt(eventId);
// FR-19-W1: like the server, the window is the claim's lease end, the same on every request; a past end is answered as
// is. No (recent) claim, e.g. /order opened directly in the mock: a window from now, as before.
const start = admittedAt !== null && time - admittedAt < ADMISSION_MS ? admittedAt : time;
// …
expiresAt: new Date(start + windowMs).toISOString(),
serverNow: today.toISOString(),
```

The page shell is unchanged. Test addition (`src/presentation/pages/Order/__tests__/index.test.tsx`, `base()` already has
`timeUpSheet: null`):

```ts
it("shows the time's-up sheet over the loading state after a reload (FR-19-W1)", () => {
  mockController({ ...base(), status: 'loading', timer: null, timeUpSheet: sheet });
  // dialog present; the skeleton (its label 'state_loading') under it; no role="timer"
});
```

## Data Models

Mock clock examples (`?mock=short_window`, claim at 03:04:09.600, window 75 s → end 03:05:24.600):

| Mock now | Request                  | `expiresAt`  | `serverNow` | Client shows       |
| -------- | ------------------------ | ------------ | ----------- | ------------------ |
| 03:04:10 | first load               | 03:05:24.600 | 03:04:10    | 1:14               |
| 03:04:44 | reload                   | 03:05:24.600 | 03:04:44    | 0:40               |
| 03:04:45 | language switch (EN)     | 03:05:24.600 | 03:04:45    | 0:39               |
| 03:05:30 | reload after 0:00        | 03:05:24.600 | 03:05:30    | 0:00 + sheet       |
| 03:05:40 | "Antre lagi" → join      | —            | —           | new number at back |
| 03:21:00 | `/order` opened directly | now + 75 s   | 03:21:00    | 1:15 (fresh)       |

The "reload after 0:00" row is mock-specific: the fallback token skips spec 64's stored-place check. On the real API a
reload after the sheet has run goes to the waiting room (the place was removed at 0:00; spec 65 reload flows).

## Layer Constraints

From `.claude/rules/presentation.md`:

- `'use client'` at the top.
- Zero hooks and zero logic of their own: `container.resolve<Interface>('xController')` at the top of render, then pass
  props to sections.
- Receive all data and callbacks as props, including `t`. Never call `useTranslation()` or `container.resolve()`.
- May hold visual micro-state only (accordion open, tooltip). Business state (step, modal triggered by the API) lives in
  the controller.
- `__tests__/index.test.tsx` for every page shell and section.
- React Testing Library; query by role and text, not test id; `userEvent` for interaction; mock `t` as `(k) => k`.
- Shells: mock `container.resolve` and assert props reach the sections.
- ❌ Hooks or conditions in a page shell
- ❌ `useTranslation()` or `container.resolve()` in a section
- ❌ Direct imports from `@core/` or `@infrastructure/`

Notes: whether the sheet shows is business state in the controller (`timeUpSheet`, specs 62 / 65); the shell's
`timeUpSheet && …` is prop passing and needs no change.

From `.claude/rules/scaffold.md`:

- Client components are still prerendered at build: read `window` / `localStorage` only inside effects or event handlers.

(The mock state reads localStorage inside `createMockQueueState`, which only runs when the mock worker starts in the
browser or in node tests, as today.)

From `.claude/rules/performance.md`:

- Don't let first-load JS grow by more than 5 KB per PR without a reason in the PR.

(The mock is loaded with a dynamic import only when `NEXT_PUBLIC_API_MOCK=true`; nothing here ships in production.)

From `CLAUDE.md`:

- Countdowns use server time: `expiresAt − serverNow` from the API, never the device clock.

## Correctness Properties

- Property 1: the Order screen with `status: 'loading'`, `timer: null` and a `timeUpSheet` renders one `dialog`, the
  skeleton (its loading label) and no `timer` role; with `status: 'error'` it renders the dialog and the error title.
  `index.tsx` has no diff. **Validates: Requirements 1**
- Property 2: device registered, `evt_pelita` joined, clock at the turn (03:04:09.600), claimed with a session; then
  `getCategories` at the same time answers `expiresAt` 03:09:09.600; at +168 s it answers the same `expiresAt` with
  `serverNow` +168 s (132 s left); with `locale = 'en'` the same `expiresAt`. **Validates: Requirements 2**
- Property 3: under `short_window` the same flow answers `admittedAt + 75 s`. **Validates: Requirements 2**
- Property 4: at `admittedAt + window + 10 s`, `getCategories` answers 200 with `expiresAt < serverNow` (unchanged
  `expiresAt`). **Validates: Requirements 2**
- Property 5: for `evt_samudra` with no claim, `expiresAt − serverNow` is 300 000 (75 000 under `short_window`); at
  `admittedAt + ADMISSION_MS` the claimed event also answers a fresh window. **Validates: Requirements 2**
- Property 6: after the window, `claimTurn` and `getMyPlace` answer 410 `EXPIRED`, and a new `joinQueue` gives a
  different `seq` with `seq − served === 1248`; a repeat claim at +120 s (inside the 300 s window) still returns the
  same admission (existing queue test). **Validates: Requirements 3**
- Property 7: the queue and booking handlers from one `createHandlers` call see the same claim (Property 2 passes);
  handlers from a second `createHandlers` call start empty (fresh `now + window`). **Validates: Requirements 3**
- Property 8: existing `queue.handlers.test.ts`, `booking.handlers.test.ts`, `scenario.test.ts` pass unchanged except
  the import path of `MOCK_SHORT_ORDER_WINDOW_MS`. **Validates: Requirements 4**

## Error Handling

No new API operation and no new screen state. What the page shows on a reload, per specs 64 / 65 (real API):

| Situation on reload                                                                                      | Page                                                     |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| window still open (place stored)                                                                         | order page, countdown from the real time left            |
| no stored place (never queued, storage cleared, sheet already ran)                                       | redirect to the waiting room                             |
| window over, place stored, server still answers the record                                               | order page at "0:00" + time's-up sheet                   |
| claim 410 `MISSED` / `EXPIRED` / `MOVED` (place stored)                                                  | header + skeleton + time's-up sheet                      |
| claim 401 / 409 `NOT_YET` / `FULL` / `NO_STOCK` / 410 `QUEUE_CLOSED`; categories 403 `ADMISSION_INVALID` | redirect to the waiting room                             |
| claim 503 `ADMISSION_UNAVAILABLE`                                                                        | "Pesanan Anda sedang disiapkan…" (spec 65) + "Coba lagi" |
| 5xx `INTERNAL_ERROR`, `NETWORK_ERROR`, `TIMEOUT`                                                         | error message + "Coba lagi" / offline banner             |
| `LOGIN_REQUIRED`, `ACCOUNT_HAS_PLACE_ELSEWHERE`, `NOT_FOUND`, 429 on the claim                           | error message (mapped or `error_unknown_error`)          |

Mock: every scenario (`error`, `offline`, `slow`, `admission_invalid`, `sold_out`) keeps its answer before the window
logic; `EXPIRED` uses the API's title "Waktu Anda sudah habis" (problem body only, never shown: the client maps codes).

## Testing Strategy

- `src/presentation/pages/Order/__tests__/index.test.tsx`: Property 1 (two `it`s).
- `src/infrastructure/mocks/__tests__/order-window.handlers.test.ts` (`// @vitest-environment node`, `setupServer`,
  `createHandlers` with a mutable `now` and `scenario`, `QueueService` / `DeviceService` / `BookingService` over
  `createHttpAdapter`, `server.resetHandlers(...createHandlers(…))` in `beforeEach`): Properties 2–7. The claim needs
  `Authorization: Bearer mock` (as the queue test's `claim` helper).
- `src/infrastructure/mocks/__tests__/booking.handlers.test.ts`: only the import of `MOCK_SHORT_ORDER_WINDOW_MS`.
- Gate: `npx tsc --noEmit && npx vitest --run && npm run build`.
- Manual check with the mock API (`npm run dev`, `NEXT_PUBLIC_API_MOCK=true`), at 390 and 1440, ID and EN:
  - `/queue?event=evt_pelita&mock=near_front` for a quick turn, sign in, then on `/order` switch to `?mock=short_window`
    (not a placement scenario, so the queue keeps the place); wait to about 0:40, reload: the timer continues (about
    0:39), not 1:15; the pink last-minute style stays;
  - switch the language: the count keeps going (no restart);
  - wait past 0:00 (sheet), reload: the time's-up sheet shows at once, timer "0:00" (mock-specific, see Data Models);
    "Antre lagi" → a new number at the back, no "missed" screen;
  - `/order?event=evt_samudra&mock=short_window` opened directly: 1:15 fresh (fallback token, no claim), as before;
  - `?mock=ok`: 5:00 window, a reload continues it;
  - DevTools: no admission token in localStorage / sessionStorage / cookies (only `rusuh.mock.queue`, the mock's own
    server state).
- Not reachable in mock mode: the stored-place check and the re-claim (fallback token). Covered by specs 64 and 65
  tests; on staging (real API) reload `/order` during the window and check the Network tab shows one
  `POST /queue/{id}/claim` then `GET /core/events/{id}/categories`, and no visit to `/queue`; reload after the sheet
  and check it lands on `/queue` with a new number.
