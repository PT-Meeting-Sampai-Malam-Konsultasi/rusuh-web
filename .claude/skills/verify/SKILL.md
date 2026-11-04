---
name: verify
description: Run the rusuh-web gate checks (typecheck, lint, tests with 85% coverage, static export build, bundle budget) plus the manual screen checklist before marking a feature or scaffold step done.
---

# Verify

## Commands (all must pass)

```bash
npx tsc --noEmit
npm run lint
npm run test:coverage      # 85% branches, functions, lines, statements
npm run build              # static export to out/
npm run check:bundle       # chunk and CSS budgets
```

Report each command's result. If a script doesn't exist yet (before `/scaffold-app` step 7), say which checks were
skipped.

## Architecture checks

- [ ] Every key in `AwilixRegistry` has a `container.register()` call (count both)
- [ ] No `process.env` outside `src/infrastructure/config.ts`
- [ ] No React/Next/Axios imports under `src/core/`
- [ ] No direct hook imports in `src/controllers/`; no `.then(`/`.catch(` on service calls
- [ ] No `'use client'` or logic in `src/app/**/page.tsx`; every flow segment has `error.tsx`
- [ ] Every `.tsx` in `src/presentation/` has a `.module.css` starting with `@reference`; no Tailwind classes in JSX
- [ ] No `console.*` / `debugger`

Useful greps:

```bash
grep -rn "process.env" src --include=*.ts --include=*.tsx | grep -v infrastructure/config.ts
grep -rnE "from '(react|next|axios)" src/core
grep -rnE "\.then\(|\.catch\(" src/controllers
grep -rnE "from '(react-i18next|@tanstack/react-query|next/navigation)'" src/controllers
grep -rln "className=\"" src/presentation
```

## Screen checks

- [ ] Every state of the screen renders at 390 and 1440 width, matching the HiFi
- [ ] ID and EN: no raw keys, no untranslated strings
- [ ] Loading overlay shows and clears in every mutation path
- [ ] Each API error code shows the right message (field or popup); `401` goes to sign-in
- [ ] Countdowns follow server time; refresh keeps the remaining time
- [ ] Keyboard: everything reachable, focus visible; screen reader announces number/timer/errors
- [ ] Analytics page view fires once

## Forbidden workarounds

- Never add source files to coverage `exclude`, never lower thresholds, never skip a test to pass the gate.
- Never disable a lint rule inline without a comment explaining why.
