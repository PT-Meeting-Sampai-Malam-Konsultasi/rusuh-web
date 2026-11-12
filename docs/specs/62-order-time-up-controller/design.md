# Design Document

## Overview

`OrderController` (`src/controllers/order.controller.ts`) is extended, not replaced. Additions:

1. **`expired` latch**: `useState(false)`, set to true by a guarded render-time update the first time spec 59's
   condition holds (`status === 'ready' && secondsLeft === 0`), never reset while mounted. `timeUp` now returns it.
2. **End the window once**: a `useEffect` keyed on `expired`, guarded by a new `ended` ref, sets the existing
   `redirected` ref, calls `endOrderWindowUseCase.execute(eventId)` (spec 61) and tracks `order_time_up`.
3. **Categories query off after expiry**: `enabled: hasEventId && !expired`.
4. **`OrderTimeUpView`** and `timeUpSheet: OrderTimeUpView | null`: translated texts, `homeHref`, and `queueAgain()`
   (`queue_rejoin` + `router.replace` to the waiting room).

One new DI key in `OrderControllerDeps` (`endOrderWindowUseCase`), no new import, query, mutation, popup or loading
overlay. Translation keys are written by spec 63 (same PR), as spec 60 did for spec 59.

**Why latch.** Spec 59's `timeUp` is derived each render and gated on `status === 'ready'`. After the window ends it can
flip back to false: the event query refetches on focus once its 60 s `staleTime` has passed and a failure turns
`status` to `'error'`; an answer already in flight can turn the categories into `admission-invalid` and `ok` to null. A
sheet that comes and goes with those would be worse than none, and the one-time effect must not depend on a value that
can toggle. "Expired" is a fact about this page visit; it lives in state.

**Why a render-time update, not an effect.** The same reasoning as spec 59's anchor: a `useEffect` that calls
`setExpired` paints one frame at "0:00" without the sheet and is what `react-hooks/set-state-in-effect` flags. The guard
(`windowOver && !expired`) is false right after the update, so it cannot loop.

**Why the side effects are in an effect.** `endOrderWindowUseCase.execute` writes storage and `trackEvent` reports out:
both are side effects and must not run in render (React may render twice in Strict Mode, or discard a render). The
effect runs after the commit that first shows the sheet.

**Rule tension recorded.** The controller rule says "never `useEffect` + service call (use `useQueryTanstack` …)".
`endOrderWindowUseCase.execute` is not a service call and not async: it is two synchronous local-store writes with no
network, nothing to cache, retry or show as loading (spec 61). The rule exists so async work goes through TanStack
(`CLAUDE.md`: "All async work goes through TanStack Query"); a `useMutationTanstack` around a synchronous no-fail call
would add a mutation state nobody reads. This spec calls it from the effect, once, and records the choice. Spec 59
Requirement 2's "SHALL NOT call a service or use case from the effect" was about the clock's interval effect, which
stays as it is.

**Why `redirected.current = true`.** After expiry the server releases the admission (sweeper), and spec 61 clears the
token, so any order call still in flight or started under the sheet (a NIK check already sent; a NIK field blurred by
keyboard under the scrim: there is no focus trap yet) answers `admission-invalid`. Today that calls
`router.replace('/queue?event=…')`, which would yank the buyer away from the message. Setting the existing guard makes
both redirect paths (categories effect, NIK `onSuccess`) no-ops. The buyer leaves through the sheet only.

**Why disable the categories query.** Its key contains the locale. A language switch under the sheet would fetch with a
cleared token → `admission-invalid` → `ok` null → `status` `'loading'` → the page behind the sheet would turn into a
skeleton (and, before the guard, redirect). Disabled, the key change shows the placeholder (the previous answer) and no
request is made: `status` stays `'ready'`, the timer stays "0:00", only the texts change. TanStack 5 applies
`placeholderData` to a disabled query in `pending` state (`queryObserver.createResult`), and the placeholder render
does not re-anchor the countdown (spec 59 guard `!isPlaceholderData`).

**Strings, not `t`.** The Order page sections that show a message (`OrderMessage`) get strings; `HolderList` gets `t`
because it renders a list with parameters per row. The sheet is a fixed message, so the controller translates it and
the section stays props-in / JSX-out. "Ke beranda" / "Go home" already exists as `action_back_home` (used by
`OrderMessage` on this page), so the sheet reuses that key instead of adding a duplicate `order_time_up_home`.

**`queueAgain` inside the view.** `QueueLeaveView` keeps its callbacks inside the view object; the sheet follows that
precedent, so the shell passes one prop and the action only exists while the sheet does.

**Accepted race (not handled).** The sweeper runs every second, so the server may release the admission up to ~1 s after
the client's zero (and the client's elapsed-time clock can drift by a fraction of a second). A buyer who clicks "Antre
lagi" inside that second may find the old place still live: the join's live-place check (ADR-0030) can answer with the
old place instead of a new number. It ends at once on the server, and the waiting room shows "missed" on the next poll.
Rare (the click needs the sheet to have rendered and been read in under a second) and harmless; not handled.

**HiFi / ADR difference.** HiFi `detail.html:13` triggers the expired state from a device-clock `data-countdown`; here it
comes from the server-time countdown of spec 59 (ADR-0005 wins). HiFi links "Antre lagi" to `waiting-room.html`; here it
is `/queue?event=<id>` through `router.replace`, so Back does not return to a dead order page.

## Architecture

```
OrderScreen ─► container.resolve('orderController')          (src/infrastructure/di/controllers/order.ts, unchanged)
  │
  ├─ const [expired, setExpired] = useState(false)          ← new, declared before categoriesQuery
  ├─ categoriesQuery  enabled: hasEventId && !expired       ← changed
  ├─ redirected (ref), redirect effect                      unchanged (now also blocked by the expiry)
  ├─ anchor, status, selection, holders, NIK mutation       unchanged
  ├─ now / secondsLeft / clock effect                        unchanged (spec 59)
  ├─ windowOver = status === 'ready' && secondsLeft === 0   (spec 59's timeUp expression)
  │     if (windowOver && !expired) setExpired(true)        ← new, guarded render-time update
  ├─ const ended = useRef(false)                             ← new
  │     useEffect(() => {
  │       if (!expired || ended.current) return;
  │       ended.current = true;
  │       redirected.current = true;
  │       endOrderWindowUseCase.execute(eventId);
  │       analyticsAdapter.trackEvent('order_time_up', { eventId, tickets: selection.total });
  │     }, [expired, endOrderWindowUseCase, analyticsAdapter, eventId, selection.total]);
  └─ return { …, timeUp: expired, timeUpSheet: expired ? { …texts, homeHref, queueAgain } : null }
```

Route `/order?event=<id>` (unchanged). API operations: none new. `getCategories` stops being requested after expiry;
`validateAttendee` calls already in flight finish and are ignored for navigation. The next request the buyer causes is
`joinQueue` on `/queue` (queue controller, unchanged), which gives a new number because spec 61 removed the stored place.

Data flow: `getCategories` (`expiresAt`, `serverNow`) → anchor → `secondsLeft` 0 → `expired` → effect →
`endOrderWindowUseCase` (stores cleared) + analytics; `expired` → `timeUpSheet` → shell → `OrderTimeUpSheet` (spec 63) →
"Antre lagi" → `queueAgain()` → `/queue?event=<id>` → join at the back.

Notes:

- Hook order stays unconditional: `useState(expired)` before the categories query, `useRef(ended)` and the new
  `useEffect` after the clock effect, all before `return`.
- If `eventId` changed while mounted (same route, new search params), the latch would carry over; accepted, as the
  spec 59 anchor does the same, and no flow links from one order page to another.
- The `ended` ref is read and written only inside the effect (no `react-hooks/refs` finding). `redirected` is written in
  the effect, as the existing redirect effect does.
- Strict Mode in development runs effects twice on mount; the `ended` ref survives the simulated remount of the same
  component instance, so the use case and the analytics still run once.

## Components and Interfaces

```ts
// src/controllers/order.controller.ts (changes; everything else unchanged, no new import)

/** The time's-up sheet (FR-18-W1): what OrderTimeUpSheet shows. Texts are translated. */
export interface OrderTimeUpView {
  /** "Waktu habis" / "Time's up". */
  stamp: string;
  /** "5 menit sudah lewat." / "Your 5 minutes are up." */
  title: string;
  /** "Pilihan Anda belum disimpan dan tempat Anda kami berikan ke nomor berikutnya. Antre lagi untuk mencoba lagi." */
  body: string;
  /** "Antre lagi" / "Queue again" (the arrow is drawn by the sheet, aria-hidden). */
  queueAgainLabel: string;
  /** "Ke beranda" / "Go home". */
  homeLabel: string;
  /** ROUTES.HOME. */
  homeHref: string;
  /** Tracks queue_rejoin and replaces the page with /queue?event=<id>: the waiting room joins at the back. */
  queueAgain: () => void;
}

export interface OrderControllerInterface {
  // …all existing fields unchanged…
  timer: OrderTimerView | null;
  /**
   * The order window has run out on this page visit: true from the first render at zero, then latched (stays true
   * whatever status does later). Drives timeUpSheet.
   */
  timeUp: boolean; // ← doc comment changed; value is now the latch
  /** Non-null exactly when timeUp. */
  timeUpSheet: OrderTimeUpView | null; // ← new
}

type OrderControllerDeps = Pick<
  AwilixRegistry,
  // …existing keys…
  'endOrderWindowUseCase' // ← new (spec 61)
>;
```

Body changes (in order of appearance):

```ts
// before categoriesQuery
const [expired, setExpired] = useState(false);

// categoriesQuery options
enabled: hasEventId && !expired,

// after the clock effect
const windowOver = status === 'ready' && secondsLeft === 0;
if (windowOver && !expired) setExpired(true);

const ended = useRef(false);
useEffect(() => {
  if (!expired || ended.current) return;
  ended.current = true;
  redirected.current = true;
  endOrderWindowUseCase.execute(eventId);
  analyticsAdapter.trackEvent('order_time_up', { eventId, tickets: selection.total });
}, [expired, endOrderWindowUseCase, analyticsAdapter, eventId, selection.total]);

// in the returned object
timeUp: expired,
timeUpSheet: expired
  ? {
      stamp: t('order_time_up_stamp'),
      title: t('order_time_up_title'),
      body: t('order_time_up_body'),
      queueAgainLabel: t('order_time_up_queue_again'),
      homeLabel: t('action_back_home'),
      homeHref: ROUTES.HOME,
      queueAgain: () => {
        analyticsAdapter.trackEvent('queue_rejoin', { eventId, from: 'order' });
        router.replace(withQuery(ROUTES.QUEUE, { event: eventId }));
      },
    }
  : null,
```

`queueAgain` is a returned callback, like `increment` and `retry` (no helper function in the body).

Compile check against the existing code and `AwilixRegistry`:

- `endOrderWindowUseCase: EndOrderWindowUseCaseInterface` is added to `AwilixRegistry` by spec 61, so the `Pick` key
  exists; `execute(eventId: string): EndOrderWindowResult` is called for its effect and its result ignored.
- `analyticsAdapter.trackEvent(name, params)` takes a params record (as `queue_join` / `order_nik_checked`);
  `{ eventId: string, tickets: number }` and `{ eventId: string, from: 'order' }` fit.
- `ROUTES.HOME`, `ROUTES.QUEUE`, `withQuery`, `useRef` are already imported.
- `OrderControllerInterface` gains one required field: the shell test's `base()` must add `timeUpSheet: null` (task 4)
  or `tsc` fails. `asFunction(OrderController)` in `src/infrastructure/di/controllers/order.ts` is unchanged; Awilix
  injects the new key from the services registry.

## Data Models

Translation keys used here. **The new ones are written to `src/translation/locale/id.json` and `en.json` by spec 63
task 1** (the page spec owns the copy; both specs land in the same PR):

| Key                         | ID                                                                                                           | EN                                                                                             | Source                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------- |
| `order_time_up_stamp`       | Waktu habis                                                                                                  | Time's up                                                                                      | HiFi `detail.html:65` |
| `order_time_up_title`       | 5 menit sudah lewat.                                                                                         | Your 5 minutes are up.                                                                         | HiFi `detail.html:66` |
| `order_time_up_body`        | Pilihan Anda belum disimpan dan tempat Anda kami berikan ke nomor berikutnya. Antre lagi untuk mencoba lagi. | Your picks weren't saved and your place went to the next number. Queue again to try once more. | HiFi `detail.html:67` |
| `order_time_up_queue_again` | Antre lagi                                                                                                   | Queue again                                                                                    | HiFi `detail.html:68` |
| `action_back_home` (exists) | Ke beranda                                                                                                   | Go home                                                                                        | HiFi `detail.html:68` |

State: `expired: boolean` (false at mount, latched); `ended: { current: boolean }`.

Analytics events:

| Name            | Params                               | When                      |
| --------------- | ------------------------------------ | ------------------------- |
| `order_time_up` | `{ eventId, tickets: totalTickets }` | once, on the first expiry |
| `queue_rejoin`  | `{ eventId, from: 'order' }`         | each `queueAgain()` call  |

`tickets` is the number picked when time ran out (0–3): it tells whether buyers time out while still choosing or while
entering NIKs. No NIK, name or token is sent.

Timeline (answer: 300 s window, arrived at T; the last column is spec 63's rendering, for orientation):

| Moment                                               | timer.seconds | timeUp | timeUpSheet | categories enabled | effect run | Page            |
| ---------------------------------------------------- | ------------- | ------ | ----------- | ------------------ | ---------- | --------------- |
| T + 0 … 299 s                                        | 300 … 1       | false  | null        | yes                | no         | order           |
| T + 300 s                                            | 0             | true   | view        | no                 | once       | order + sheet   |
| T + 310 s, language switched (placeholder, no fetch) | 0             | true   | view (EN)   | no                 | no         | order + sheet   |
| T + 320 s, NIK check answers `admission-invalid`     | 0             | true   | view        | no                 | no         | no redirect     |
| T + 360 s, event refetch fails (`status` `'error'`)  | (timer null)  | true   | view        | no                 | no         | error + sheet   |
| "Antre lagi"                                         | —             | —      | —           | —                  | —          | `/queue?event=` |
| Answer with `expiresAt <= serverNow` at first ready  | 0             | true   | view        | no (after)         | once       | order + sheet   |

## Layer Constraints

From `.claude/rules/controller.md`:

- Page UI state (`useState`), form state (`useForm` + Zod, `useWatch`)
- Queries and mutations wrapping use cases or services (`useQueryTanstack`, `useMutationTanstack`)
- Loading overlay (`useLoading`), error popup (`usePopupError`), navigation (`useRouterNext`)
- Translation of codes into text (`t` from `useTranslation`)
- Analytics (`trackPageView` once on mount, `trackEvent` on actions)
- Timers derived from server time, polling intervals (`refetchInterval`), SSE subscriptions through a DI adapter
- Business rules, validation, data transformation → use case
- HTTP details, storage, tokens → infrastructure
- Helper functions defined in the body → `src/utils/` (pure) or a use case (business)
- ✅ import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
- ✅ import type { ... } from '@core/...';
- ✅ import type { AwilixRegistry } from '@infrastructure/di/registry.types';
- ❌ import { useRouter, useSearchParams } from 'next/navigation'; // DI: useRouterNext, useSearchParamsNext
- ❌ any runtime import from @core/services, @infrastructure, or a context
- `export default` the factory; named export the interface `{Page}ControllerInterface`.
- Return only what the screen needs, already translated or formatted.
- One query or mutation per async operation. Never call a service inside another mutation's `onSuccess`/`onError`.
- Never `.then()/.catch()`; never `useEffect` + service call (use `useQueryTanstack`, with `refetchInterval` for polling).
- Countdowns: compute from `expiresAt − serverNow` (plus elapsed client time since the response), never `Date.now()`
  against a deadline alone.
- Registered in its own `src/infrastructure/di/controllers/{page-name}.ts` as `asFunction(Controller)` — **no**
  `.singleton()` — and that file is imported by the page shell, never by `registerAll()` (see scaffold rule).
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

Notes: the store writes are in the use case (spec 61), not here ("storage, tokens → infrastructure"; the controller
receives the use case through DI). The effect calls a synchronous use case, not a service, and no async work is added
(rule tension in the Overview). No mutation is added, so the `toggleLoading` line does not apply; no loading overlay is
shown for the expiry. `endOrderWindowUseCase` is registered in `services.registry.ts` by spec 61. The countdown is
unchanged and still server-time based.

From `.claude/rules/error-handling.md`:

- `401` always goes to sign-in; never an "unauthorized" page.
- ❌ Technical messages to users
- ❌ Auto-retrying mutations without the user

From `.claude/rules/core-use-case.md` (who owns what):

- Business rules and validation
- ❌ Navigation, analytics or translation calls

(Navigation, analytics and text stay in this controller; forgetting the tokens is the use case.)

From `CLAUDE.md`:

- All async work goes through TanStack Query (`useQuery` / `useMutation`) — never `.then()` or `useEffect` + fetch.
- Countdowns use server time: `expiresAt − serverNow` from the API, never the device clock.
- Errors from the API carry a stable `code`; map it to a translation key, never show raw messages.

## Correctness Properties

- Property 1: with `okResult` (300 s) anchored at the fake now, `timeUp` is false and `timeUpSheet` null at 0 s, 150 s
  and 299 s; `endOrderWindowUseCase.execute` and `trackEvent('order_time_up', …)` are not called.
  **Validates: Requirements 1, 2**
- Property 2: after advancing 300 s, `timeUp` is true and `timeUpSheet` equals
  `{ stamp: 'order_time_up_stamp', title: 'order_time_up_title', body: 'order_time_up_body', queueAgainLabel:
'order_time_up_queue_again', homeLabel: 'action_back_home', homeHref: '/', queueAgain: expect.any(Function) }`.
  **Validates: Requirements 1, 4**
- Property 3: an answer with `expiresAt === serverNow` gives `timeUp` true and a non-null sheet in the first result after
  the answer is ready (no timer advance). **Validates: Requirements 1**
- Property 4: after expiry and 60 more seconds of fake time with several rerenders (including a changed
  `totalTickets`), `endOrderWindowUseCase.execute` has been called exactly once with `'evt_samudra'` and
  `trackEvent('order_time_up', { eventId: 'evt_samudra', tickets: n })` exactly once, where `n` is the ticket count at
  expiry. **Validates: Requirements 2**
- Property 5 (latch): after expiry, rerendering with the event query failed (`status` `'error'`) keeps `timeUp` true and
  `timeUpSheet` non-null; `timer` becomes null (spec 59 rule); the use case is still called once.
  **Validates: Requirements 1**
- Property 6: the categories query options have `enabled: true` before expiry and `enabled: false` in every render after
  it; after a language switch to `en` the captured categories key is `['categories', 'evt_samudra', 'en']` with
  `enabled: false`. **Validates: Requirements 3**
- Property 7: after expiry, setting the categories state to `{ data: { kind: 'admission-invalid' } }` and rerendering does
  not call `router.replace`; calling the captured NIK mutation's `onSuccess` with `{ kind: 'admission-invalid' }` does
  not call `router.replace`. Before expiry, the existing redirect test still passes (one `replace`).
  **Validates: Requirements 3**
- Property 8: `timeUpSheet.queueAgain()` calls `trackEvent('queue_rejoin', { eventId: 'evt_samudra', from: 'order' })`
  and `router.replace('/queue?event=evt_samudra')`, and does not call `router.push`. **Validates: Requirements 4**
- Property 9: with `useTranslation` returning a `tFor(language)` that prefixes the language, the sheet's texts are
  `id:…` before and `en:…` after switching (rerender), while `timer.seconds` stays 0. **Validates: Requirements 3, 4**
- Property 10: no service is called because of the expiry (`catalogService` / `accountService` /
  `getOrderCategoriesUseCase` call counts unchanged across the zero); `OrderControllerDeps` gains only
  `endOrderWindowUseCase` (no `useLoading` / `usePopupError` added); every existing `OrderController` test passes; the
  shell test compiles with `timeUpSheet: null`. **Validates: Requirements 2, 5**

## Error Handling

No new API operation. How each existing outcome behaves around the expiry:

| Operation / code                                                        | Before expiry (unchanged)                  | After expiry                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `getCategories` 200 `ok`                                                | ready, countdown                           | not requested (query disabled); placeholder keeps the page             |
| `getCategories` no token / 403 `ADMISSION_INVALID`                      | `router.replace('/queue?event=<id>')` once | not requested; if an answer was already in flight, no redirect (guard) |
| `getCategories` 401 `UNAUTHORIZED`                                      | status `error`, `error_unauthorized`       | not requested                                                          |
| `getCategories` 5xx `INTERNAL_ERROR`, `NETWORK_ERROR`, `TIMEOUT`, other | status `error` + "Coba lagi"               | not requested                                                          |
| `getEvent` 404 `NOT_FOUND` / other failure (refetch on focus)           | not-found / error view                     | that view under the sheet; sheet stays (latch)                         |
| `validateAttendee` → `admission-invalid` (403 `ADMISSION_INVALID`)      | redirect once                              | ignored (guard); the field stays as it was                             |
| `validateAttendee` other outcomes / failures                            | field states (spec 55)                     | land on the field under the sheet; no popup                            |
| `getMe` failure                                                         | silent                                     | silent                                                                 |
| Expiry itself (not an API error)                                        | —                                          | sheet; no popup, no overlay; `order_time_up`                           |
| `endOrderWindowUseCase` throws (storage failure)                        | —                                          | thrown in the effect (React reports it); the sheet is already shown    |

If the use case throws, "Antre lagi" still navigates; the waiting room then resumes the dead place, gets 410 `EXPIRED`
and shows `missed`, which offers its own "Antre lagi". The buyer still gets back in line, one click later.

The "Coba lagi" of an error view under the sheet is not reachable by pointer (the scrim covers it); `retry()` refetches
only failed queries, and the categories query is disabled. No new error code, no new `ERROR_CODE_MAP` entry.

States covered: loading / error / not-found before expiry (no sheet, as today); ready counting (no sheet); ready at
zero (sheet); already expired at first answer (sheet at once); status changing after expiry (sheet stays); offline at
zero (the sheet still shows: it needs no network; "Antre lagi" then meets the waiting room's own offline handling).
Both languages: the sheet's texts follow the language; the countdown stays 0.

## Testing Strategy

`src/controllers/__tests__/order.controller.test.ts`, new `describe('order time up (FR-18-W1)')`:

- Harness: add `endOrderWindowUseCase: { execute: vi.fn(() => ({ kind: 'ended' })) }` to `deps()`. The file already
  captures `categoriesOptions` (read `enabled` and `queryKey`) and `mutationOptions` (call `onSuccess`). Reuse the
  countdown harness of spec 59: `vi.useFakeTimers({ now: … })`, `categoriesState = { data: okResult, dataUpdatedAt:
<fake now> }`, `eventState = { data: event }`, `act(() => vi.advanceTimersByTime(ms))`, `vi.useRealTimers()` in
  `afterEach`.
- Expired-at-once answer: `{ ...okResult, expiresAt: okResult.serverNow }`.
- Latch: after expiry set `eventState = { isError: true, error: { status: 500, code: 'INTERNAL_ERROR' } }` and
  `rerender()`.
- Redirect guard: after expiry set `categoriesState = { data: { kind: 'admission-invalid' } }` and rerender; and call
  `mutationOptions.onSuccess({ kind: 'admission-invalid' }, variables)` inside `act`.
- Language: the `tFor(language)` pattern already in the file (`current = { t: tFor('en'), i18n: { language: 'en', … } }`
  then `rerender()`).
- One `it` per Property 1–9; Property 10 is the existing suite plus "call count unchanged" assertions on the services
  and `getOrderCategoriesUseCase.execute` (the controller has no loading or popup dependency to assert on).
- Fixture: add `timeUpSheet: null` to `base()` in `src/presentation/pages/Order/__tests__/index.test.tsx` (rendering is
  spec 63).
- Gate: `npx tsc --noEmit && npx vitest --run`; controller coverage ≥ 85%. `npm run lint` runs in lint-staged; check
  there that the guarded `setExpired` passes the `react-hooks` rules and that `ended` is only touched inside the effect.
