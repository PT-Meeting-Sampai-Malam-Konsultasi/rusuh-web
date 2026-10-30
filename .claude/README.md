# Claude Code steering — rusuh-web

Ported on 29 Oct 2026 from the team's Kiro `fe-steering` (v2.4.0), rewritten for **Next.js 16 (App Router, static
export) + Tailwind CSS 4** and for Rusuh Booking Tiket. MyTelkomsel-specific parts were removed.

## Layout

```
CLAUDE.md                 Always loaded: stack, architecture, where rules are, non-negotiables (imports AGENTS.md)
.claude/
├── rules/                Load automatically when matching files are read or edited (`paths:` frontmatter)
│   ├── scaffold.md         next.config, env/config, DI, providers, i18n, export-mode limits
│   ├── core-service.md     protocols, entities, services, adapters
│   ├── core-use-case.md    use cases
│   ├── controller.md       controllers
│   ├── presentation.md     route files, page shells, sections, CSS modules
│   ├── design-system.md    Poster Sablon tokens and patterns
│   ├── error-handling.md   error.tsx / global-error / network status / API errors
│   ├── performance.md      Core Web Vitals and bundle budgets
│   └── git-conventions.md  conventional commits, hooks
├── skills/               Invoked as /scaffold-app, /add-feature, /verify
│   ├── scaffold-app/       SKILL.md + reference/ (7 scaffold steps)
│   ├── add-feature/        SKILL.md + reference/ (spec format, entity, service, use case, controller, page)
│   └── verify/             gate checks + screen checklist
└── agents/               Sub-agents the skills delegate to
    spec-writer · scaffold-writer · service-writer · use-case-writer · controller-writer · presentation-writer
```

fe-steering also configured the Playwright MCP server for browser checks. It is not set up here; add it yourself if
you want it (`claude mcp add playwright -- npx @playwright/mcp@latest`, or a project `.mcp.json`).

Kiro's "manual inclusion" became path-scoped rules: each rule loads only when Claude works on files it covers, so
nothing large sits in every conversation except `CLAUDE.md`.

## What changed from fe-steering

| fe-steering | Here |
| --- | --- |
| Vite, TanStack Router file routes, `@tailwindcss/vite`, `import.meta.env`, `VITE_*` | Next.js App Router route files, `@tailwindcss/turbopack`, `process.env.NEXT_PUBLIC_*` read literally in `config.ts` |
| `main.tsx` bootstrap + provider tree | `app/layout.tsx` (server) + `app/providers.tsx` (client) |
| `useNavigateTanstack`, `useParamsTanstack` in DI | `useRouterNext`, `usePathnameNext`, `useSearchParamsNext`, `useParamsNext` from `next/navigation` |
| Route `errorComponent`, `AppErrorBoundary` | `error.tsx` per segment, `global-error.tsx`, `not-found.tsx` (`{ error, retry }`) |
| Page shell in TanStack route | Route file (server) renders a `'use client'` page shell |
| Nginx SPA Docker image | Static export (`out/`) to S3 + CloudFront; export-mode limits documented |
| Kiro specs in `.kiro/specs/`, Kiro-enforced format | `docs/specs/` with the same three-file format, no Kiro tooling |
| Kiro agent JSON + md | Claude Code sub-agents (`.claude/agents/*.md`) |
| `start-rewrite` orchestrator | `/add-feature` (new features from the Rusuh PRD/App Flow/API) and `/scaffold-app` |

Kept as is: clean architecture layers and their rules, Awilix four-registry DI, controllers as DI factories, TanStack
Query for all async, `t` passed as a prop, CSS Modules with `@reference` + `@apply`, 85% coverage, Core Web Vitals and
bundle budgets, conventional commits (now with feature scopes and the ticket in the subject), the no-debug pre-commit check.

## Removed (MyTelkomsel-specific)

- Legacy rewrite workflow: `start-rewrite` skill, the 11 `analysis-dim*` steering files, `utils/analysis.md`,
  `incremental-delivery.md` (legacy ↔ rewrite route split), business-flow checkpoint, `docs/rewrite-flow/`,
  `docs/business-flow-analysis/`, `docs/feedback/`, the Telkomsel-branded summary report.
- `create-confluence-doc` skill and the `mytsel-devtools` MCP server (Jira, GitLab, Confluence).
- WCMS translations/assets (`/translation/v2/...`, `/v1/asset/web`), `getAssetImage`, web-UI config prefetch,
  `cross-cutting-services.md`.
- Legacy specifics: verbatim legacy translations, legacy SCSS conversion tables, legacy `.env` key mapping, WCMS image
  keys, MyTelkomsel logo paths, encryption protocol and `HASH` / `TRANSACTIONID` headers.
- Telkomsel infrastructure: dev host `tdwpreweb.telkomsel.com` with mkcert, JFrog nginx image, preprod htpasswd image,
  Makefile and SonarQube settings, GitLab submodule instructions.

## Keeping it current

- New decision that changes a rule → edit the rule and note it in the docs repo (ADR if architectural).
- Next.js upgrades: re-read `node_modules/next/dist/docs/` for anything a rule mentions (error file props, export
  limits, fonts, CSS loader).
