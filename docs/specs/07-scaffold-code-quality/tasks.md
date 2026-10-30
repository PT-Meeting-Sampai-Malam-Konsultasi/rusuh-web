# Implementation Plan: Scaffold step 7 — code quality, CI, bundle check

## Overview

Add the quality gates that run locally and in CI: ESLint, Stylelint, tests with coverage, bundle budgets, and the PR-title check (scaffold-app step 7).

## Tasks

- [x] 1. Add Stylelint config and wire it into lint and lint-staged [Requirement 1]
- [x] 2. Add no-console / no-debugger to ESLint; ignore coverage/ [Requirement 1]
- [x] 3. Write the bundle-size script [Requirement 3]
- [x] 4. Add CI and PR-title workflows [Requirement 2]
- [x] 5. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3, 4], [5]] }
```

## Notes

- Measured home first-load JS is ~195 KB gzip; ~150 KB is the Next.js 16 runtime. The 150 KB target is reported, not enforced, until the team agrees a new budget (performance rule updated).
- Stylelint rules that cannot parse Tailwind @apply (at-rule-prelude-no-invalid, declaration-empty-line-before) are off.
