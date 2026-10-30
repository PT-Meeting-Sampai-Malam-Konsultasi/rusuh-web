# rusuh-web

Web client of **Rusuh Booking Tiket**: concert tickets sold online during a flash crowd. Fans wait in a fair virtual
queue that shows their exact number and estimated wait, order up to 3 tickets (one NIK per ticket), pay through
Midtrans and get their e-tickets.

Product and API documentation live in [`rusuh-documentation`](https://github.com/PT-Meeting-Sampai-Malam-Konsultasi/rusuh-documentation):
the PRD, App Flow, Design Brief, Backend Schema, Implementation Plan, ADRs and `api/openapi.yaml`. Read the App Flow
screen before building it.

## Stack

Next.js 16 (App Router, static export) · React 19 · TypeScript · Tailwind CSS 4 + CSS Modules · TanStack Query ·
React Hook Form + Zod · Awilix DI · i18next (Bahasa Indonesia, English) · Axios · Vitest + Testing Library ·
Playwright · ESLint, Prettier, Stylelint.

## Requirements

- Node.js **22** and npm (the repo uses `package-lock.json`; don't use yarn, pnpm or bun)
- Git with SSH access to the `PT-Meeting-Sampai-Malam-Konsultasi` organisation

## Getting started

```bash
git clone git@github.com:PT-Meeting-Sampai-Malam-Konsultasi/rusuh-web.git
cd rusuh-web
npm install                  # also installs the git hooks (husky)
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

All variables are `NEXT_PUBLIC_*`, so they end up in the browser bundle: put **no secrets** in them. They are read only
in `src/infrastructure/config.ts` and frozen at build time, so each environment needs its own build.

## Scripts

| Command          | What it does                                           |
| ---------------- | ------------------------------------------------------ |
| `npm run dev`    | Development server                                     |
| `npm run build`  | Static export to `out/`                                |
| `npm run start`  | Serves `out/` locally, for checking a production build |
| `npm run lint`   | ESLint                                                 |
| `npm run format` | Prettier on the whole repo                             |

Type checking: `npx tsc --noEmit`. Test, coverage and bundle-size scripts arrive with the scaffold (see below).

## Project structure

```
src/
├── app/              Next.js routes (thin server components): /, /queue, /login, /order, /payment, /tickets, /account
├── presentation/     Client screens: page shells + section components, each with a CSS module
├── controllers/      Page logic: factories that receive hooks and services from the DI container
├── core/             Pure TypeScript: protocols, entities, services, use cases
├── infrastructure/   Config, adapters (HTTP, storage, analytics, queue stream), DI container, i18n
├── contexts/         Loading, error popup, network status, session
├── translation/      id.json, en.json
├── styles/app.css    Tailwind entry and Poster Sablon design tokens
└── utils/            Constants (error codes, query keys, routes) and pure helpers
```

Dependencies point one way: `app → presentation → controllers → core`, with `infrastructure` plugged in through DI.
Routes, folders and file names are in English; the UI text is translated. The full rules are in [`CLAUDE.md`](CLAUDE.md)
and [`.claude/rules/`](.claude/rules).

The architecture base (DI, adapters, providers, i18n, tests) is not built yet: run `/scaffold-app` in Claude Code to
set it up.

## Contributing

Work is tracked on the GitHub project board **Rusuh Booking Tiket**; every card is a TOR requirement code
(`FR-01`…`FR-25`, `NFR-01`…`NFR-10`, `BR-01`…`BR-08`).

**Branches** — from `main`, short-lived, named after the type and ticket:

```
feat/FR-06-otp-code-step
fix/FR-21-payment-timer
chore/update-eslint          ← tooling work has no ticket
```

**Commits** — conventional commits with a feature scope and the ticket in the subject:

```
feat(login): [FR-06] add otp code step
fix(queue): [FR-07][FR-09] stop eta jumping up after a pause
chore(deps): bump next to 16.4.3
```

- Scopes: `home`, `queue`, `login`, `order`, `payment`, `ticket`, `account`, plus `scaffold`, `deps`, `ci`, `steering`,
  `i18n`, `style`, `docs`.
- A ticket is required for `feat`, `fix`, `refactor`, `perf` and `test`; optional for `chore`, `ci`, `docs`, `style`
  and `revert`.
- Mind the spaces: `feat(login): [FR-06] add…` — after the colon and after the bracket.

**Pull requests** — open against `main`, one review, green checks, then **squash merge**. The PR title becomes the
commit on `main`, so write it in the commit format above.

**Git hooks** (installed by `npm install`):

| Hook         | Checks                                                                      |
| ------------ | --------------------------------------------------------------------------- |
| `pre-commit` | Blocks `console.*` and `debugger`; runs ESLint and Prettier on staged files |
| `commit-msg` | Rejects messages that don't follow the format                               |

Full conventions: [`.claude/rules/git-conventions.md`](.claude/rules/git-conventions.md).

## Working with Claude Code

Start Claude Code inside this folder so it loads `CLAUDE.md`, the rules, the skills and the Playwright browser tools
(approve the `playwright` MCP server the first time).

| Skill           | Use it to                                                            |
| --------------- | -------------------------------------------------------------------- |
| `/scaffold-app` | Set up the architecture base, step by step                           |
| `/add-feature`  | Build a screen end to end: spec, service, use case, controller, page |
| `/verify`       | Run the checks before calling work done                              |

## Deploy

```bash
npm run build                # writes the static site to out/
```

Upload `out/` to S3 and serve it through CloudFront (see the TRD in `rusuh-documentation`). There is no Node.js server:
Server Actions, cookies, middleware and dynamic routes are not available, so ids travel as search params
(`/queue?event=…`).
