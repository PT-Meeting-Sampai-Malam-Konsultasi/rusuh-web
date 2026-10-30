---
name: scaffold-app
description: Set up the rusuh-web architecture base on top of the generated Next.js 16 project — dependencies, path aliases, protocols and adapters, Awilix DI with four registries, i18n and Tailwind theme, contexts and shared components, providers and error boundaries, code-quality tooling and Vitest. Use once at the start, or to add a missing scaffold step.
---

# Scaffold the app

Builds the base every feature relies on. Run the steps in order; each ends with a gate check that must pass before the
next starts. Read `.claude/rules/scaffold.md` first.

## Before you start

1. Read `CLAUDE.md`, `.claude/rules/scaffold.md` and the design-system rule.
2. Check the project state: `git status`, `package.json`, `src/`. Skip steps already done; never overwrite work without
   saying so.
3. For each step, write a short spec with the `spec-writer` agent into `docs/specs/0{n}-scaffold-{step}/` (format in
   `../add-feature/reference/spec-format.md`), then delegate the implementation to `scaffold-writer` (or the named
   writer) with the spec, this skill's reference file and the relevant rule.

## Steps

| # | Step | Reference | Writer | Gate |
| --- | --- | --- | --- | --- |
| 1 | Dependencies, aliases, env, `public/` | `reference/project-config.md` | scaffold-writer | `npm install && npx tsc --noEmit` |
| 2 | Protocols, config, adapters | `reference/protocols-adapters.md` | scaffold-writer | `npx tsc --noEmit` |
| 3 | DI container and registries | `reference/di-container.md` | scaffold-writer | `npx tsc --noEmit` |
| 4 | i18n and styles (theme tokens, fonts) | `reference/i18n-styles.md` | scaffold-writer | `npx tsc --noEmit` |
| 5 | Contexts and shared components | `reference/contexts-components.md` | presentation-writer | `npx tsc --noEmit && npx vitest --run` |
| 6 | Layout, providers, error boundaries, 404 | `reference/bootstrap.md` | presentation-writer | `npm run build` |
| 7 | Code quality, hooks, tests, bundle check | `reference/code-quality.md` | scaffold-writer | `npm run build && npm run test && npm run lint` |

Cross-cutting services (catalog, auth session) are **not** scaffold work: build them as features with `/add-feature`.

## After the last step

- Run `/verify`.
- Commit per step: `chore(scaffold): add di container` (no ticket needed; see the git-conventions rule).
- Update `CLAUDE.md` if a command or path changed.
