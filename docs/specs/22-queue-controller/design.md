# Design Document

## Overview

`QueueController` (DI factory, not a hook) with `useQueryTanstack` for the event list (`[QUERY_KEYS.EVENTS]`,
shared with Home) and for the join (`[QUERY_KEYS.QUEUE_PLACE, eventId]`, `staleTime: Infinity`, `retry: false`).
Navigation items come from a shared `mainNav()` helper, also used by Home.

## Layer Constraints

- Controllers are DI factories, not hooks; framework hooks come from DI (`useQueryTanstack`, `useSearchParamsNext`,
  `useTranslation`); the route file wraps the screen in `<Suspense>`.
- Never `.then()/.catch()`; never `useEffect` + service call.
- Errors: `ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR` → `t(key)`.
- Countdowns from server time plus elapsed client time, never `Date.now()` alone.

## Correctness Properties

- Property 1: one join request per visit. **Validates: Requirements 4**

## Error Handling

Thrown errors become the `error` state with a translated message and `retry()` (refetch).

## Testing Strategy

Controller tests with mocked DI hooks for every state, the numbers and the analytics calls.
