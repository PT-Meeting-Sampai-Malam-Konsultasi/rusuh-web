@AGENTS.md

# rusuh-web

Web client of **Rusuh Booking Tiket**: concert tickets sold during a flash crowd (waiting room → order → pay → e-ticket).
Product and API live in the sibling repo `../rusuh-documentation` — read the [PRD](../rusuh-documentation/product/prd.md),
[App Flow](../rusuh-documentation/product/app-flow.md), [Design Brief](../rusuh-documentation/product/design-brief.md),
[Backend Schema](../rusuh-documentation/tech/backend-schema.md) and `api/openapi.yaml` before building a screen.
Where they differ, the ADRs in `../rusuh-documentation/adr/` win.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 App Router, **static export** (`output: "export"` → `out/`, served from S3 + CloudFront) |
| UI | React 19, TypeScript strict |
| Styling | Tailwind CSS 4 (`@tailwindcss/turbopack` loader) + CSS Modules with `@reference` / `@apply` |
| Server state | TanStack Query |
| Forms | React Hook Form + Zod |
| DI | Awilix (PROXY mode) |
| i18n | i18next + react-i18next, `id` default, `en` (ADR-0014) |
| HTTP | Axios, only inside the HTTP adapter |
| Tests | Vitest + React Testing Library (jsdom), Playwright e2e |
| Lint | ESLint 9 flat (`eslint-config-next`), Prettier, Stylelint |

This Next.js version has breaking changes from older training data. Read `node_modules/next/dist/docs/` before using an
API you have not checked (for example, `error.tsx` receives `retry`, not `reset`).

## Architecture (clean architecture, one direction only)

```
src/app/            Next.js route files: thin, server components; metadata + render the screen
src/presentation/   Client screens ('use client'): page shell resolves its controller, sections are props-in/JSX-out
src/controllers/    Page logic: factory functions that use hooks received from DI; return a typed interface
src/core/           Pure TypeScript, zero framework: protocols/, entities/, services/, use_case/
src/infrastructure/ Adapters, config, DI container + 4 registries, i18n
src/contexts/       Loading, popup-error, network-status providers (hooks registered in DI)
src/styles/app.css  Tailwind entry + @theme tokens (Poster Sablon)
```

| Layer | May depend on | Never on |
| --- | --- | --- |
| `core/` | nothing | React, Next, Axios, browser APIs, infrastructure |
| `infrastructure/` | `core/` protocols | controllers, presentation |
| `controllers/` | `core/` types + DI deps | infrastructure concretions, presentation, direct hook imports |
| `presentation/` | controllers via `container.resolve` | `core/` directly, infrastructure |
| `app/` | presentation screens | everything else |

DI registry order: **infrastructure → services → helpers → controllers**. Every key in `AwilixRegistry` has a
`container.register()` call.

## Where the rules are

Rules in `.claude/rules/` load automatically when you touch matching files. Workflows are skills:

| Need | Use |
| --- | --- |
| Set up the architecture base (deps, DI, adapters, providers, i18n, tooling) | `/scaffold-app` |
| Build a feature or page end to end (spec → entity → service → use case → controller → page) | `/add-feature` |
| Gate check before marking work done | `/verify` |
| Layer writers (delegated by the skills) | agents `spec-writer`, `scaffold-writer`, `service-writer`, `use-case-writer`, `controller-writer`, `presentation-writer` |

## Commands

```bash
npm run dev          # local dev server
npm run build        # static export to out/
npm run lint
npm run test         # once Vitest is scaffolded
npx tsc --noEmit
```

## Non-negotiables

- All async work goes through TanStack Query (`useQuery` / `useMutation`) — never `.then()` or `useEffect` + fetch.
- Countdowns use server time: `expiresAt − serverNow` from the API, never the device clock.
- Errors from the API carry a stable `code`; map it to a translation key, never show raw messages.
- No secrets in `NEXT_PUBLIC_*`; only `src/infrastructure/config.ts` reads `process.env`.
- NIKs are shown masked after entry and never logged.
- Static export: no Server Actions, cookies, rewrites, Route Handlers that read the request, or dynamic routes without
  `generateStaticParams` — pass runtime ids (event, booking) as search params.
- Routes, folders and file names are English (`/queue`, `/login`, `/order`, `/payment`, `/tickets`, `/account`);
  only the UI copy is Indonesian/English through i18n. Route table: `.claude/rules/presentation.md`.
- Git: branch `type/FR-xx-short-name` from `main`, never commit to `main`. Commits and PR titles:
  `feat(login): [FR-06] add otp code step` — feature scope, ticket in the subject (chore/ci/docs/style/revert may
  omit it); squash-merge PRs. No `Co-Authored-By` or "Generated with" attribution lines. Full rules:
  `.claude/rules/git-conventions.md`.
