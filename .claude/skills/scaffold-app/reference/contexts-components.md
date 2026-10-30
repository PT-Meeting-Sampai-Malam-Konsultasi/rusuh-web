# Step 5 — Contexts and shared components

Delegate to `presentation-writer`. Everything here is `'use client'`.

## Contexts (`src/contexts/`)

| File | Provides |
| --- | --- |
| `loading.context.tsx` | `LoadingProvider`, `useLoading()` → `{ isLoading, toggleLoading }` (counter-based, so nested toggles balance) |
| `popup-error.context.tsx` | `PopupErrorProvider`, `usePopupError()` → `{ openPopupError({ title?, message, action? }), closePopupError }` |
| `network-status.context.tsx` | `NetworkStatusProvider`, `useNetworkStatus()` → `{ isOnline }`; `navigator.onLine` + 30 s heartbeat |
| `__tests__/*.test.tsx` | One per context |

Project contexts come with features (e.g. `session.context.tsx` with the access token and user, from `/add-feature`).

## Shared components (`src/presentation/components/`)

| Component | Notes |
| --- | --- |
| `LoadingOverlay` | Full-screen, `aria-busy`, shown while `isLoading` |
| `ErrorPopup` | Sheet on phones, modal on desktop; ink border, pink offset; focus trapped; closes on Escape |
| `OfflineBanner` | Non-blocking, `aria-live="polite"` |
| `Button`, `Stamp`, `Timer`, `TextField` | The one control grammar from the design-system rule; props only |

Each has `index.tsx`, a `.module.css` with `@reference`, and `__tests__/index.test.tsx`. Shared components never call
`useTranslation()`: strings come in as props.

## Constants (`src/utils/constants/`)

- `error-codes.ts`: `ERROR_CODE_MAP` from every `ErrorCode` in `openapi.yaml` to a translation key (registered in
  `helpers.registry.ts`).
- `query-keys.ts`, `storage-keys.ts`, `routes.ts` (route paths as constants).

Replace the step-3 placeholders for `useLoading`, `usePopupError`, `useNetworkStatus` with the real hooks.

## Gate

```bash
npx tsc --noEmit && npx vitest --run
```
