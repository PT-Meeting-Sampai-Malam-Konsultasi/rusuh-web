# Design Document

## Overview

`OrderController` (`src/controllers/order.controller.ts`) is extended, not replaced. Additions:

1. **`OrderTimerView`** (`{ seconds, label }`) and two interface fields: `timer: OrderTimerView | null`,
   `timeUp: boolean`.
2. **An anchor** in `useState`: the `expiresAt` / `serverNow` of the last real `ok` categories answer and the moment it
   arrived (`categoriesQuery.dataUpdatedAt`).
3. **One clock**: `useState(() => Date.now())` + `setInterval` in `useEffect`, running only while an anchored `ok` answer
   has time left (the pattern of `queue.controller.ts` lines 306–324).
4. **Derived values**: seconds left → `timer` (whole seconds, `t('order_timer_label')`) and `timeUp`.

No new dependency, import, DI key, query, mutation, analytics event or popup. No use case: the use-case rule table asks
for one for "multi-step flow, business validation, branching on status"; this is one subtraction on fields the use case
of spec 13 already returns, and the controller rule puts countdowns in the controller.

**Seconds, not a formatted string.** The controller rule says "Return only what the screen needs, already translated or
formatted". The shared `Timer` component (`src/presentation/components/Timer/`) takes `seconds` and does the `m:ss`
formatting and the pink warning (`seconds <= warnAt`) itself, and the queue controller already feeds it `turn.seconds`.
This controller follows that existing contract: whole seconds and the translated label; no `value`, no `urgent`, no
`formatCountdown`.

**Rule tension recorded.** `.claude/rules/core-use-case.md` lists "remaining time from `expiresAt − serverNow`" among use
case examples, while `.claude/rules/controller.md` says "Timers derived from server time" belong in a controller and
gives the countdown formula. The elapsed part needs React state (the clock) and TanStack's `dataUpdatedAt`, neither of
which a use case may touch, and `queue.controller.ts` already computes its two countdowns inline. This spec follows the
controller rule and that precedent.

### Anchoring mechanism (the placeholder trap)

`categoriesQuery` has `placeholderData: (previous) => previous` and a key that includes `locale`. Read in
`node_modules/@tanstack/query-core/src/queryObserver.ts` (installed version 5.105.0, `createResult`): when the key changes,
the result is built from the **new** query's state (`dataUpdatedAt: newState.dataUpdatedAt`, which is `0` for a query that
has never answered), while `data` is the previous answer and `isPlaceholderData` is `true` (`status` is reported as
`'success'`). So the `queue.controller.ts` formula `now − query.dataUpdatedAt` would see an elapsed time of ~56 years
during a language switch: the timer would drop to "0:00" and `timeUp` would turn true for a moment.

Mechanism chosen: **the anchor lives in controller state and is only written from a real answer.**

```ts
const [anchor, setAnchor] = useState<TimerAnchor | null>(null);
if (ok && !categoriesQuery.isPlaceholderData && categoriesQuery.dataUpdatedAt !== anchor?.receivedAt) {
  setAnchor({ expiresAt: ok.expiresAt, serverNow: ok.serverNow, receivedAt: categoriesQuery.dataUpdatedAt });
}
```

- This is React's documented "adjust state while rendering" pattern (a guarded `setState` in the render body; React
  re-renders at once, before commit, so no frame is painted without the anchor). The guard becomes false right after the
  update (`dataUpdatedAt === anchor.receivedAt`), so it cannot loop.
- The countdown reads **only the anchor**, never `ok.expiresAt` or `categoriesQuery.dataUpdatedAt` directly. A
  placeholder render leaves the anchor alone, so the seconds continue; the fresh answer (new `dataUpdatedAt`)
  re-anchors, which is also how a refetch or the error view's "Coba lagi" resyncs with the server.
- The guard compares `dataUpdatedAt`, not object identity: structural sharing can hand back the same object for an
  identical refetch, and a new `dataUpdatedAt` is exactly "a new answer arrived".
- Why not the alternatives: a `useEffect` that calls `setAnchor` paints one frame with the wrong value and is the
  pattern `react-hooks/set-state-in-effect` exists to flag (eslint-plugin-react-hooks 7.1.1 through `eslint-config-next`);
  a `useRef` written or read during render is what `react-hooks/refs` flags; stamping the arrival time into the query
  data inside `queryFn` changes the query's data type and every existing categories test; module-level state is
  forbidden.
- `Date.now()` is never called in the render body (`react-hooks/purity`): only in the `useState` initialiser and the
  interval callback, as in `queue.controller.ts`.

**Difference from the brief (small tightening).** The brief says `timer` is null "until the categories answer is `ok`
(loading, error, not-found, admission-invalid redirect)". Categories can be `ok` while the event query is still loading or
has failed, where `status` is `'loading'` / `'error'` / `'not-found'`. To make the listed states hold literally, `timer` and
`timeUp` are gated on `status === 'ready'` (which implies `ok`). The clock itself keeps ticking whenever an anchored `ok`
answer has time left, whatever the event query does, so the value is right the moment the page becomes ready.

## Architecture

```
OrderScreen ─► container.resolve('orderController')          (src/infrastructure/di/controllers/order.ts, unchanged)
  │
  ├─ eventQuery, categoriesQuery, meQuery, status, selection, holders, NIK checks      unchanged
  ├─ ok = categoriesQuery.data (kind 'ok')                                             unchanged
  ├─ anchor: TimerAnchor | null                               ← new useState, written in render from a real answer
  │     guard: ok && !categoriesQuery.isPlaceholderData && categoriesQuery.dataUpdatedAt !== anchor?.receivedAt
  ├─ now: number                                              ← new useState(() => Date.now())
  ├─ windowSeconds = (Date.parse(anchor.expiresAt) − Date.parse(anchor.serverNow)) / 1000
  ├─ secondsLeft   = ok && anchor && Number.isFinite(windowSeconds)
  │                    ? Math.max(0, windowSeconds − Math.max(0, now − anchor.receivedAt) / 1000)
  │                    : null
  ├─ ticking = secondsLeft !== null && secondsLeft > 0
  │     useEffect(() => { if (!ticking) return; const id = setInterval(() => setNow(Date.now()), 1000);
  │                       return () => clearInterval(id); }, [ticking])
  ├─ timer  = status === 'ready' && secondsLeft !== null
  │             ? { seconds: Math.floor(secondsLeft), label: t('order_timer_label') }
  │             : null
  └─ timeUp = status === 'ready' && secondsLeft === 0
```

Route `/order?event=<id>` (unchanged). API operation: `getCategories` through `getOrderCategoriesUseCase` (spec 13), no
new call. Data flow: `getCategories` → use case `ok` result (`expiresAt`, `serverNow`) → anchor → `timer` / `timeUp` →
shell → `FlowHeader` `timer` slot → `Timer` (spec 60).

Notes on the arithmetic:

- `now` and `anchor.receivedAt` are both device-clock readings; only their difference is used, so a clock that is wrong
  by any constant amount cancels out. The window length uses server times only.
- `Math.max(0, now − receivedAt)`: `now` is refreshed once a second, so an answer can arrive up to a second "after" the
  last clock reading; the clamp keeps elapsed at 0 instead of adding time. It also absorbs a device clock set backwards.
- A device clock changed **during** the window shifts the elapsed time until the next answer re-anchors. Accepted (same
  as the queue countdowns); the server is the judge of the window in any case (`ADMISSION_INVALID`).
- Each tick reads `Date.now()`, so a throttled background tab catches up on its next tick.
- `timer.seconds` is floored, so it changes when a whole second is crossed; a late tick can skip a value, never show a
  wrong one. `timeUp` uses the unrounded value: `timer.seconds` can read 0 for the last fraction of a second before
  `timeUp` turns true.
- The hook calls (`useState` ×2, `useEffect`) are unconditional and placed after `status` is computed and before the
  `return`; the guarded `setAnchor` sits right after `ok` is derived.

## Components and Interfaces

```ts
// src/controllers/order.controller.ts (changes; everything else unchanged, no new import)

/** The order-window countdown for the flow header (FR-17-W1): what the shared Timer component takes. */
export interface OrderTimerView {
  /** Whole seconds left, rounded down, never negative. From server time plus elapsed client time. */
  seconds: number;
  /** "sisa waktu memilih" / "left to choose". */
  label: string;
}

export interface OrderControllerInterface {
  // …all existing fields unchanged…
  /** Null unless status is 'ready' and the answer's expiresAt / serverNow are valid dates. */
  timer: OrderTimerView | null; // ← new
  /** The order window has run out (seconds left is 0). Exposed for FR-18-W1; nothing reacts to it yet. */
  timeUp: boolean; // ← new
}

// OrderControllerDeps: unchanged (no new key).
```

Module-scope type (not exported):

```ts
/** The answer the countdown runs from: its server times and when it arrived (the query's dataUpdatedAt). */
interface TimerAnchor {
  expiresAt: string;
  serverNow: string;
  receivedAt: number;
}
```

Compile check against the existing code and `AwilixRegistry`:

- `useQueryTanstack<OrderCategoriesResult, HttpError>(…)` returns TanStack's `UseQueryResult`, which has
  `dataUpdatedAt: number` and `isPlaceholderData: boolean`; no cast needed.
- `ok` is already narrowed to the `kind: 'ok'` member, whose `expiresAt` and `serverNow` are `string`.
- `anchor?.receivedAt` is `number | undefined`; `dataUpdatedAt !== undefined` is true, so the first real answer anchors.
- `OrderControllerInterface` widens by two required fields: the shell test's fake controller must gain them (task 3) or
  `tsc` fails. `asFunction(OrderController)` in `src/infrastructure/di/controllers/order.ts` is unchanged; no
  `AwilixRegistry` change.

## Data Models

Translation key used by this controller. **It is written to `src/translation/locale/id.json` and `en.json` by spec 60
task 1** (the page spec owns the copy; both specs land in the same PR).

| Key                 | ID                 | EN             | Source                |
| ------------------- | ------------------ | -------------- | --------------------- |
| `order_timer_label` | sisa waktu memilih | left to choose | HiFi `detail.html:13` |

State shapes: `anchor: TimerAnchor | null` (null until the first real `ok` answer), `now: number` (epoch ms of the last
tick).

Example (answer: `serverNow` 03:00:00Z, `expiresAt` 03:05:00Z, arrived at device time T; the device clock may be any
value). The last column is what `Timer` will print (spec 60), for orientation only:

| Moment                                                                 | timer.seconds | timeUp | interval | Timer shows |
| ---------------------------------------------------------------------- | ------------- | ------ | -------- | ----------- |
| categories still loading                                               | (timer null)  | false  | off      | —           |
| T                                                                      | 300           | false  | on       | 5:00        |
| T + 48 s                                                               | 252           | false  | on       | 4:12        |
| T + 240 s                                                              | 60            | false  | on       | 1:00 (pink) |
| T + 300 s and later                                                    | 0             | true   | off      | 0:00 (pink) |
| T + 100 s, language switched (placeholder, `dataUpdatedAt` 0)          | 200           | false  | on       | 3:20        |
| T + 112 s, EN answer arrives (`serverNow` 03:01:52Z, same `expiresAt`) | 188           | false  | on       | 3:08        |
| `expiresAt: 'soon'` (does not parse)                                   | (timer null)  | false  | off      | —           |
| event query failed, categories `ok` (status `error`)                   | (timer null)  | false  | on       | —           |

## Layer Constraints

From `.claude/rules/controller.md`:

- Page UI state (`useState`), form state (`useForm` + Zod, `useWatch`)
- Queries and mutations wrapping use cases or services (`useQueryTanstack`, `useMutationTanstack`)
- Translation of codes into text (`t` from `useTranslation`)
- Analytics (`trackPageView` once on mount, `trackEvent` on actions)
- Timers derived from server time, polling intervals (`refetchInterval`), SSE subscriptions through a DI adapter
- Business rules, validation, data transformation → use case
- HTTP details, storage, tokens → infrastructure
- Helper functions defined in the body → `src/utils/` (pure) or a use case (business)
- ✅ import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
- ✅ import type { ... } from '@core/...';
- ✅ import type { AwilixRegistry } from '@infrastructure/di/registry.types';
- ❌ import { useQuery, useMutation } from '@tanstack/react-query'; // DI: useQueryTanstack, useMutationTanstack
- ❌ any runtime import from @core/services, @infrastructure, or a context
- `export default` the factory; named export the interface `{Page}ControllerInterface`.
- Return only what the screen needs, already translated or formatted.
- One query or mutation per async operation. Never call a service inside another mutation's `onSuccess`/`onError`.
- Never `.then()/.catch()`; never `useEffect` + service call (use `useQueryTanstack`, with `refetchInterval` for polling).
- Error display (fallback through the same DI map, no extra import): `ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR` → `t(key)` → `openPopupError()` or a field error.
  `401` goes to sign-in; `NETWORK_ERROR` shows the offline message.
- Countdowns: compute from `expiresAt − serverNow` (plus elapsed client time since the response), never `Date.now()`
  against a deadline alone.
- Registered in its own `src/infrastructure/di/controllers/{page-name}.ts` as `asFunction(Controller)` — **no**
  `.singleton()` — and that file is imported by the page shell, never by `registerAll()` (see scaffold rule).
- File name `{page-name}.controller.ts`, never `use-…`.
- `src/controllers/__tests__/{page-name}.controller.test.ts`
- Mock every DI dependency (hooks return plain objects); capture `useMutationTanstack` options and call
  `mutationFn` / `onSuccess` / `onError` directly.
- Test: returned interface, loading in all paths, error mapping, navigation targets, analytics.
- Coverage threshold 85%.
- [ ] No `.then(`, `.catch(`, or `useEffect` with a service call
- [ ] No direct imports of framework or context hooks
- [ ] No business logic or helpers in the body
- [ ] One query/mutation per async operation
- [ ] `toggleLoading()` in all three mutation paths
- [ ] Every destructured DI key has a `container.register()` call
- [ ] The screen needs nothing beyond the returned interface

Notes: the new `useEffect` only starts and clears an interval (no service call). No helper function is added to the
body: the countdown is expressions on `anchor` and `now`. No mutation is added, so the `toggleLoading` line does not
apply to this change. `seconds` is a number, not a formatted string, because the shared `Timer` formats it (Overview).

From `.claude/rules/core-use-case.md` (when to create one):

| Scenario                                                  | Use case?                                       |
| --------------------------------------------------------- | ----------------------------------------------- |
| Simple GET, no transformation                             | No — controller wraps the service in `useQuery` |
| Multi-step flow, business validation, branching on status | Yes                                             |

From `CLAUDE.md`:

- All async work goes through TanStack Query (`useQuery` / `useMutation`) — never `.then()` or `useEffect` + fetch.
- Countdowns use server time: `expiresAt − serverNow` from the API, never the device clock.
- Errors from the API carry a stable `code`; map it to a translation key, never show raw messages.

## Correctness Properties

- Property 1: with an answer of `serverNow` 03:00:00Z / `expiresAt` 03:05:00Z that arrived "now", `timer` is
  `{ seconds: 300, label: 'order_timer_label' }`, whether the faked device clock is 2026-11-09T03:00:00Z, ten hours
  earlier or the year 2031. **Validates: Requirements 1**
- Property 2: after advancing the fake timers by 48 s `timer.seconds` is 252; it is always a non-negative integer and
  never increases between ticks; no argument passed to `storage.set` contains `expiresAt`.
  **Validates: Requirements 1, 2**
- Property 3: an answer that arrived 30 s before mount (`dataUpdatedAt = now − 30 000`) starts at 270: elapsed time since
  the answer counts, not time since mount; an answer that arrived 30.4 s before gives 269 (rounded down).
  **Validates: Requirements 1**
- Property 4: after the window has fully elapsed `timer` is `{ seconds: 0, label }`, `timeUp` is true,
  `vi.getTimerCount()` is 0, and advancing another 10 s changes nothing; while seconds are left `timeUp` is false;
  `router.replace`, `analyticsAdapter.trackEvent` (beyond the page view) and `mutate` are not called because of it.
  **Validates: Requirements 2, 3**
- Property 5: an answer with `expiresAt` equal to or before `serverNow` gives `seconds: 0` and `timeUp` at once, with no
  interval. **Validates: Requirements 3**
- Property 6 (placeholder): after 100 s (`seconds` 200), rerendering with `i18n.language = 'en'` and the categories
  state `{ data: sameAnswer, dataUpdatedAt: 0, isPlaceholderData: true }` still gives 200 and `timeUp` false; 10 s later 190. **Validates: Requirements 4**
- Property 7 (re-anchor): then a real answer `{ serverNow: 03:01:52Z, expiresAt: 03:05:00Z }` with a new `dataUpdatedAt`
  (the current fake time) and `isPlaceholderData: false` gives 188, and ticks on from there; a refetch that returns a
  later `expiresAt` moves the seconds up to the server's number. **Validates: Requirements 4**
- Property 8: `timer` is null and `timeUp` false while loading (no categories data), when categories failed, without an
  event id, when the event is not found, when the event query failed although categories are `ok`, and for
  `admission-invalid` (which still redirects once). **Validates: Requirements 5**
- Property 9: `expiresAt: 'soon'`, `serverNow: ''` or either one `undefined` (cast in the test) gives `timer` null,
  `timeUp` false and `vi.getTimerCount()` 0. **Validates: Requirements 5**
- Property 10: unmounting while the countdown runs leaves `vi.getTimerCount()` at 0. **Validates: Requirements 2**
- Property 11: every existing `OrderController` test still passes; `OrderControllerDeps` has the same keys and the file
  has no new import; the shell test compiles with `timer: null`, `timeUp: false`. **Validates: Requirements 6**

## Error Handling

`getCategories` (through `getOrderCategoriesUseCase`, spec 13) — handling is unchanged; only the timer column is new:

| Status / code                                                                        | Outcome (existing)                                                                      | timer / timeUp          |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------- |
| 200                                                                                  | `ok` → status `ready`                                                                   | counted from the answer |
| 200 with unparseable `expiresAt` / `serverNow`                                       | `ok` → status `ready`, page usable                                                      | `null` / false          |
| no token, 403 `ADMISSION_INVALID`                                                    | `router.replace('/queue?event=<id>')`                                                   | `null` / false          |
| 401 `UNAUTHORIZED`                                                                   | status `error`, `error_unauthorized` (the login sheet is NFR-07-W2)                     | `null` / false          |
| 5xx `INTERNAL_ERROR`, `NETWORK_ERROR`, `TIMEOUT`, other (after `retryTransientOnce`) | status `error`, `t(ERROR_CODE_MAP[code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR)` + "Coba lagi" | `null` / false          |

`getEvent` 404 / `NOT_FOUND` → `not-found`; other failures → `error`: `timer` null in both. `getMe` failures stay silent.
`validateAttendee` outcomes (spec 55) are unchanged and do not affect the timer. Time running out is not an API error:
it only sets `timeUp` (the sheet and "Antre lagi" are FR-18-W1); the server refuses later calls with `ADMISSION_INVALID`,
which the existing redirects handle. No new error code, no new `ERROR_CODE_MAP` entry.

## Testing Strategy

`src/controllers/__tests__/order.controller.test.ts`, new `describe('order countdown (FR-17-W1)')`:

- Harness: extend `QueryState` with `dataUpdatedAt?: number` and `isPlaceholderData?: boolean`. The categories fake
  returns `dataUpdatedAt: answeredAt, isPlaceholderData: false` by default, where `answeredAt` is a `let` set **once** in
  `beforeEach` (`answeredAt = Date.now()`), then `...categoriesState` on top. It must be a stable number per test: a fresh
  `Date.now()` on every render would re-anchor on every render and loop. With this default the existing tests see a full
  window (`timeUp` false) instead of an expired one.
- Countdown tests use `vi.useFakeTimers({ now: … })` in the test (or a nested `beforeEach`) and `vi.useRealTimers()` in
  `afterEach`; `categoriesState = { data: okResult, dataUpdatedAt: <fake now> }`, `eventState = { data: event }`; time
  moves with `act(() => vi.advanceTimersByTime(ms))`; language and query changes go through `rerender()` after mutating
  `i18n.language` / `categoriesState` (as the existing tests do).
- One `it` per Property 1–10. Property 1 runs with `it.each` over three fake device times. Property 6 and 7 are one
  flow (anchor → placeholder → fresh answer) so the test proves the same mounted controller carries the anchor.
- Interval checks use `vi.getTimerCount()` (0 before an answer, 1 while counting, 0 at zero and after unmount).
- `okResult` in the file already has a 300 s window (`serverNow` 03:00:00Z, `expiresAt` 03:05:00Z); reuse it.
- No warning-state assertions here: the pink state is `Timer`'s `seconds <= warnAt` and is tested in spec 60.
- Fixture: add `timer: null` and `timeUp: false` to `base()` in `src/presentation/pages/Order/__tests__/index.test.tsx`
  (behaviour tests for the rendered timer are spec 60).
- Gate: `npx tsc --noEmit && npx vitest --run`; controller coverage ≥ 85%. `npm run lint` runs in lint-staged; check
  there that the guarded `setAnchor` passes the `react-hooks` rules and that no `Date.now()` sits in the render body.
