---
paths:
  - "src/app/**/error.tsx"
  - "src/app/global-error.tsx"
  - "src/app/**/not-found.tsx"
  - "src/contexts/**"
  - "src/presentation/components/**"
  - "src/controllers/**"
---

# Error boundaries and fallback UI

No user ever sees a white screen. Every crash, API failure and network loss has a calm fallback in the Rusuh voice.

## Boundaries (Next.js file conventions)

```
app/global-error.tsx      ← replaces the root layout on a crash; defines its own <html> and <body>
app/layout.tsx
  Providers (NetworkStatusProvider → …)
    app/error.tsx         ← app-level fallback inside the layout
      app/{segment}/error.tsx   ← one per flow segment (antrian, masuk, pesan, bayar, tiket, akun)
        page.tsx → Screen → sections
app/not-found.tsx         ← 404
```

- Error files are client components (`'use client'`) and receive `{ error: unknown, retry: () => void }` in this
  Next.js version (not `reset`). Check `node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md`.
- Fallbacks are static: no API calls, no DI resolution, no hooks beyond logging in `useEffect`.
- Log the error (analytics adapter or `reportError`) before showing the fallback. Never show stack traces or status codes.
- Segment fallback keeps the layout and offers "Coba lagi" (`retry()`) and a way back (Home).
- In the queue and payment segments, the fallback says the place / held tickets are safe and how to return
  ("Nomor Anda tetap aman").

## Network status

`src/contexts/network-status.context.tsx` — `NetworkStatusProvider` + `useNetworkStatus` (registered in DI):

- `navigator.onLine` events plus a light heartbeat (every 30 s), because `onLine` alone is unreliable.
- Non-blocking banner with `aria-live="polite"`; loaded content stays usable.
- No automatic replay of failed mutations; the user retries.
- The waiting room keeps the last number with "Diperbarui n detik lalu" and resumes polling when back online.

## API errors in controllers

```ts
onError: (error: HttpError) => {
  toggleLoading();
  if (error.code === 'NETWORK_ERROR') return openPopupError({ message: t('error_network') });
  if (error.status === 401) return router.push('/masuk');
  if (error.code === 'ADMISSION_INVALID') return router.push(`/antrian?event=${eventId}`);
  openPopupError({ message: t(ERROR_CODE_MAP[error.code] ?? 'error_unknown') });
}
```

- Field-level codes (`NIK_INVALID`, `DUPLICATE_NIK`, `NIK_SEAT_TAKEN`, `WRONG_CODE`…) show under the field, not in a popup.
- `401` always goes to sign-in; never an "unauthorized" page.
- Every code the endpoint can return (see `openapi.yaml`) has an entry in `ERROR_CODE_MAP` and both locale files.

## Anti-patterns

- ❌ A flow segment without `error.tsx`
- ❌ Fallbacks that call APIs or resolve the container
- ❌ Swallowing errors in components; try/catch in render
- ❌ Technical messages to users
- ❌ Auto-retrying mutations without the user
