---
paths:
  - "next.config.ts"
  - "package.json"
  - "tsconfig.json"
  - "src/infrastructure/**"
  - "src/contexts/**"
  - "src/app/layout.tsx"
  - "src/app/providers.tsx"
---

# Scaffold, infrastructure and DI

Every rule here is mandatory. Check imports and layer direction before writing a file.

## Next.js configuration

- `output: "export"` stays on. The site is static HTML/JS on S3 + CloudFront (TRD §2, §11).
- Keep `cacheComponents` and `partialPrefetching` **off**: they fail the build in export mode
  ("PPR cannot be enabled in export mode").
- `images: { unoptimized: true }` — there is no image optimizer in export mode.
- `turbopack.root: __dirname` and the `@tailwindcss/turbopack` CSS loader stay as generated.
- Not available in export mode: Server Actions, `cookies()`, `headers()`, rewrites/redirects/headers in config, Proxy
  (middleware), ISR, Route Handlers that read the request, dynamic routes without `generateStaticParams`.
- Runtime ids (event, booking) travel as **search params**, e.g. `/queue?event=evt_2026_samudra`.

## Path aliases (tsconfig `paths`)

| Alias | Folder |
| --- | --- |
| `@/*` | `src/*` |
| `@core/*` | `src/core/*` |
| `@infrastructure/*` | `src/infrastructure/*` |
| `@controllers/*` | `src/controllers/*` |
| `@presentation/*` | `src/presentation/*` |
| `@contexts/*` | `src/contexts/*` |
| `@utils/*` | `src/utils/*` |
| `@styles/*` | `src/styles/*` |

Vitest resolves the same aliases through `vite-tsconfig-paths`.

## Configuration

- `src/infrastructure/config.ts` is the **only** file that reads `process.env`.
- Read every variable **literally** (`process.env.NEXT_PUBLIC_API_BASE_URL`): Next.js inlines `NEXT_PUBLIC_*` at build
  time and does not inline dynamic lookups (`process.env[name]`).
- Use `requireEnv(value, name)` for mandatory values (throws at startup), `optionalEnv` for defaults, `boolEnv` for flags.
- Only public values go in `NEXT_PUBLIC_*` (API base URLs, Midtrans **client** key, Turnstile site key). No secrets.
- Values are frozen at build: one build per environment.
- Registered in DI as `asValue(config)`.

## DI container (Awilix, PROXY mode)

- Four registries, strict order: `infrastructure.registry.ts → services.registry.ts → helpers.registry.ts →
  controllers.registry.ts`, called by `registerAll()` in `src/infrastructure/di/index.ts`. Later registries may depend on
  earlier ones, never the reverse.
- Lifetimes:
  - Adapters: `asFunction(createAdapter).singleton()`
  - Services and use cases: `asFunction(Factory).singleton()`
  - Controllers: `asFunction(Controller)` — **no** `.singleton()` (they call hooks, fresh per resolve)
  - Config, constants, hook references: `asValue(...)`
- `AwilixRegistry` (`src/infrastructure/di/registry.types.ts`) is the single source of truth. **Every key in it has a
  `container.register()` call** in one of the four registries. Awilix resolves at runtime, so TypeScript will not catch a
  missing registration. Count keys vs registrations after every change.
- Constants such as `ERROR_CODE_MAP` go in `helpers.registry.ts` as `asValue(object)`, never an empty `{}`.

### Hooks registered in `infrastructure.registry.ts` (as `asValue`, real implementations)

| DI key | Source |
| --- | --- |
| `useTranslation` | `react-i18next` |
| `useQueryTanstack`, `useMutationTanstack`, `useQueryClientTanstack` | `@tanstack/react-query` |
| `useRouterNext`, `usePathnameNext`, `useSearchParamsNext`, `useParamsNext` | `next/navigation` |
| `useLoading`, `usePopupError`, `useNetworkStatus` | `src/contexts/*` |
| project context hooks (e.g. `useSession`) | `src/contexts/*` |

Controllers receive these as parameters; they never import them.

## Client-only modules

- The container, registries, adapters and contexts are client-side. Files that touch hooks, `window`, `localStorage`
  or the container start with `'use client'` or are only imported from such files.
- Client components are still prerendered at build: read `window` / `localStorage` only inside effects or event handlers.

## App bootstrap

- `src/app/layout.tsx` (server component): `<html lang="id">`, fonts via `next/font/local` (Bricolage Grotesque,
  Space Grotesk — see the design-system rule), `import '@styles/app.css'`, and `<Providers>{children}</Providers>`.
- `src/app/providers.tsx` (`'use client'`): calls `registerAll()` once at module scope, then nests, outermost first:
  `I18nextProvider → QueryClientProvider → NetworkStatusProvider → LoadingProvider → PopupErrorProvider →
  [project providers, e.g. SessionProvider] → children`.
- No service calls in `layout.tsx` or `providers.tsx`: wiring only. Data needed early is fetched with `useQuery` inside a
  provider (`PrefetchProvider` pattern), with `retry: 1` and silent failure.

## Data fetching

- **Every** service or use-case call is wrapped in `useQuery` or `useMutation` — in controllers, providers, everywhere.
- Never `.then()/.catch()` on a service call, never `useEffect` + service call.
- Query keys live in `src/utils/constants/query-keys.ts`.

## Translations (i18next)

- Resources: `src/translation/locale/id.json` and `en.json`, same keys in both, flat `snake_case`, single namespace.
- `lng` default `id`, `fallbackLng: 'id'`, `useSuspense: false`.
- The chosen language persists in `localStorage` (`STORAGE_KEYS.LANGUAGE`) and on the account (`locale`); restore it on
  the client after mount, set `<html lang>` and the `Accept-Language` header from it.
- Copy comes from the HiFi / Design Brief voice rules; write ID first, then a full EN translation.

## Anti-patterns

- ❌ Reading `process.env` outside `config.ts`, or reading it dynamically
- ❌ Turning on `cacheComponents` / `partialPrefetching` / `output: "standalone"` without changing the hosting decision
- ❌ A key in `AwilixRegistry` without a registration
- ❌ `.singleton()` on a controller; `asFunction` for a hook
- ❌ Service calls in `layout.tsx`, `providers.tsx` or route files
- ❌ Server Actions, `cookies()`, middleware/proxy, or dynamic segments without `generateStaticParams`
