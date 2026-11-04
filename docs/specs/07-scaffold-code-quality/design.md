# Design Document

## Overview

.stylelintrc.json, eslint rules, scripts/check-bundle-size.mjs, .github/workflows/ci.yml and pr-title.yml.

## Architecture

Local: husky pre-commit (no-debug + lint-staged) and commit-msg (commitlint). CI: the same checks on GitHub Actions with .env.example as public placeholder env.

## Components and Interfaces

```bash
npm run lint | test:coverage | build | check:bundle
```

## Data Models

None beyond the interfaces above.

## Layer Constraints

From git-conventions.md and performance.md: no debug code; commit and PR-title format; budgets.

## Correctness Properties

Property 1: A PR cannot merge with failing lint, tests, coverage < 85% or a broken build
**Validates: Requirements 2**

Property 2: The framework chunk is exempt from the per-chunk budget
**Validates: Requirements 3**

## Error Handling

Build-time only: the gate check fails.

## Testing Strategy

Gate: npm run build && npm run test && npm run lint, plus node scripts/check-bundle-size.mjs.
