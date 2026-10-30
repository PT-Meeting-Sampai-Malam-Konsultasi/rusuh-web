---
paths:
  - "src/controllers/**"
---

# Controllers

A controller is the **page logic orchestrator**: a factory function that receives its dependencies from the DI container,
uses React hooks inside its body, and returns a typed interface that is the page shell's only data source.

```ts
// src/controllers/waiting-room.controller.ts
const WaitingRoomController = (deps: Pick<AwilixRegistry, ...>): WaitingRoomControllerInterface => { ... };
export default WaitingRoomController;          // registered as asFunction(WaitingRoomController)

function useWaitingRoomController() { ... }    // ❌ not a controller — controllers are not hooks
```

The page shell calls `container.resolve<WaitingRoomControllerInterface>('waitingRoomController')` **unconditionally at
the top of its render**, so the hooks inside the factory keep a stable order.

## Belongs in a controller

- Page UI state (`useState`), form state (`useForm` + Zod, `useWatch`)
- Queries and mutations wrapping use cases or services (`useQueryTanstack`, `useMutationTanstack`)
- Loading overlay (`useLoading`), error popup (`usePopupError`), navigation (`useRouterNext`)
- Reading search params (`useSearchParamsNext`) — the route file must wrap the screen in `<Suspense>`
- Translation of codes into text (`t` from `useTranslation`)
- Analytics (`trackPageView` once on mount, `trackEvent` on actions)
- Timers derived from server time, polling intervals (`refetchInterval`), SSE subscriptions through a DI adapter

## Does not belong

- Business rules, validation, data transformation → use case
- HTTP details, storage, tokens → infrastructure
- Helper functions defined in the body → `src/utils/` (pure) or a use case (business)

## Allowed imports

```ts
✅ import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
✅ import { useForm, useWatch } from 'react-hook-form';
✅ import { zodResolver } from '@hookform/resolvers/zod';
✅ import { z } from 'zod';
✅ import type { ... } from '@core/...';
✅ import type { AwilixRegistry } from '@infrastructure/di/registry.types';
✅ import type { TFunction } from 'i18next';

❌ import { useTranslation } from 'react-i18next';           // DI: useTranslation
❌ import { useQuery, useMutation } from '@tanstack/react-query'; // DI: useQueryTanstack, useMutationTanstack
❌ import { useRouter, useSearchParams } from 'next/navigation';  // DI: useRouterNext, useSearchParamsNext
❌ import { useLoading } from '@contexts/loading.context';    // DI: useLoading
❌ any runtime import from @core/services, @infrastructure, or a context
```

## Rules

- `export default` the factory; named export the interface `{Page}ControllerInterface`.
- Return only what the screen needs, already translated or formatted.
- `toggleLoading()` in **all three** mutation paths: `mutationFn`, `onSuccess`, `onError`. A missing one leaves the
  overlay stuck.
- One query or mutation per async operation. Never call a service inside another mutation's `onSuccess`/`onError`.
- Never `.then()/.catch()`; never `useEffect` + service call (use `useQueryTanstack`, with `refetchInterval` for polling).
- Error display: `ERROR_CODE_MAP[error.code] ?? 'error_unknown'` → `t(key)` → `openPopupError()` or a field error.
  `401` goes to sign-in; `NETWORK_ERROR` shows the offline message.
- Countdowns: compute from `expiresAt − serverNow` (plus elapsed client time since the response), never `Date.now()`
  against a deadline alone.
- `useWatch` for reactive form values; never `watch()` (React 19 re-render issue).
- `trackPageView` inside `useEffect(..., [])`, not in the render body.
- Registered in `controllers.registry.ts` as `asFunction(Controller)` — **no** `.singleton()`.
- File name `{page-name}.controller.ts`, never `use-…`.

## Testing

- `src/controllers/__tests__/{page-name}.controller.test.ts`
- Mock every DI dependency (hooks return plain objects); capture `useMutationTanstack` options and call
  `mutationFn` / `onSuccess` / `onError` directly.
- Test: returned interface, loading in all paths, error mapping, navigation targets, analytics.
- Coverage threshold 85%.

## Checklist before marking done

- [ ] No `.then(`, `.catch(`, or `useEffect` with a service call
- [ ] No direct imports of framework or context hooks
- [ ] No business logic or helpers in the body
- [ ] One query/mutation per async operation
- [ ] `toggleLoading()` in all three mutation paths
- [ ] Every destructured DI key has a `container.register()` call
- [ ] The screen needs nothing beyond the returned interface
