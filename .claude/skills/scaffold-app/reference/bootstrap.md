# Step 6 — Layout, providers, error boundaries

Delegate to `presentation-writer`.

## Files

| File | Content |
| --- | --- |
| `src/app/layout.tsx` | Server component: `<html lang="id" className={fonts}>`, `import '@styles/app.css'`, `metadata` (title template `%s · Rusuh`), `<body><Providers>{children}</Providers></body>` |
| `src/app/providers.tsx` | `'use client'`; `registerAll()` at module scope; one `QueryClient` per browser session (`useState(() => new QueryClient(...))`); provider nesting below; renders `LoadingOverlay`, `ErrorPopup`, `OfflineBanner` |
| `src/app/error.tsx` | App-level fallback (`'use client'`, `{ error, retry }`) |
| `src/app/global-error.tsx` | Root fallback with its own `<html>`/`<body>` |
| `src/app/not-found.tsx` | 404 in the Rusuh voice, link home |
| `src/app/page.tsx` | Replace the generator's sample with the Home route file (renders the Home screen once it exists; a placeholder screen until then) |

## Provider nesting (outermost first)

```
I18nextProvider → QueryClientProvider → NetworkStatusProvider → LoadingProvider → PopupErrorProvider →
[project providers, e.g. SessionProvider] → children
```

`QueryClient` defaults: `retry: 1` for queries, `0` for mutations; `refetchOnWindowFocus: false` except where a
controller opts in (the waiting room resumes polling on focus).

## Rules

- No service calls in `layout.tsx` or `providers.tsx`.
- `registerAll()` runs before any provider renders and only once (guard against Fast Refresh re-runs).
- Fallbacks are static and log through the analytics adapter (resolved lazily inside `useEffect`, never during render).
- Remove the generator's sample content and images.

## Gate

```bash
npm run build      # static export must succeed
```
