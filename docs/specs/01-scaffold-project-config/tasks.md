# Implementation Plan: Scaffold step 1 — project configuration

## Overview

Configure the generated Next.js 16 project for the rusuh-web architecture: path aliases, scripts, test runner, editor settings and public assets (scaffold-app step 1).

## Tasks

- [x] 1. Add path aliases to tsconfig [Requirement 1]
- [x] 2. Add npm scripts [Requirement 2]
- [x] 3. Add vitest.config.mts and vitest.setup.ts [Requirement 2]
- [x] 4. Add .nvmrc and .editorconfig [Requirement 2]
- [x] 5. Fonts, robots.txt, Rusuh icon; remove generator assets [Requirement 3]
- [x] 6. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2, 3, 4, 5], [6]] }
```

## Notes

- Vitest config was moved here from step 7 because step 5 already runs tests.
- No Rusuh favicon exists in the HiFi; a simple "R!" SVG icon (src/app/icon.svg) stands in until design provides one.
