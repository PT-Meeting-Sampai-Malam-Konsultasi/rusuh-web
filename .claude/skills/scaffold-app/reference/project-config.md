# Step 1 — Project configuration

The Next.js project already exists (`create-next-app`, Next.js 16, React 19, Tailwind 4, ESLint 9, `src/`, App Router).
This step adds the architecture's dependencies and settings. Don't re-create files the generator made; edit them.

## Install

Use the latest compatible versions (`npm install <pkg>` without pinning old majors), then pin what got installed
(exact versions in `package.json`).

```bash
# runtime
npm install awilix @tanstack/react-query axios i18next react-i18next react-hook-form @hookform/resolvers zod
# dev
npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths jsdom \
  @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom \
  @vitest/coverage-v8 prettier stylelint stylelint-config-standard \
  husky lint-staged @commitlint/cli @commitlint/config-conventional
```

Add later, when the feature needs it: an SSE client that can send headers (e.g. `@microsoft/fetch-event-source`) for the
queue stream (ADR-0015); `openapi-typescript` to generate API types from `../rusuh-documentation/api/openapi.yaml`.

## `tsconfig.json`

Keep the generated options; add the aliases from the scaffold rule:

```json
"paths": {
  "@/*": ["./src/*"],
  "@core/*": ["./src/core/*"],
  "@infrastructure/*": ["./src/infrastructure/*"],
  "@controllers/*": ["./src/controllers/*"],
  "@presentation/*": ["./src/presentation/*"],
  "@contexts/*": ["./src/contexts/*"],
  "@utils/*": ["./src/utils/*"],
  "@styles/*": ["./src/styles/*"]
}
```

## `next.config.ts`

Already set: `output: "export"`, `images.unoptimized`, `turbopack.root`, the Tailwind loader. Do not add
`cacheComponents` or `partialPrefetching` (they break export mode).

## Scripts (`package.json`)

```json
"dev": "next dev",
"build": "next build",
"start": "npx serve out",
"lint": "eslint && stylelint \"src/**/*.css\"",
"format": "prettier --write .",
"test": "vitest --run",
"test:watch": "vitest",
"test:coverage": "vitest --run --coverage",
"typecheck": "tsc --noEmit",
"check:bundle": "next build && node scripts/check-bundle-size.mjs",
"prepare": "husky"
```

## Environment

`.env.example` (committed) and `.env.local` (git-ignored), all public values only:

```
NEXT_PUBLIC_APP_VERSION=0.1.0
NEXT_PUBLIC_QUEUE_API_URL=http://localhost:8081/v1
NEXT_PUBLIC_CORE_API_URL=http://localhost:8082/v1
NEXT_PUBLIC_API_TIMEOUT_MS=10000
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxx
NEXT_PUBLIC_MIDTRANS_SNAP_URL=https://app.sandbox.midtrans.com/snap/snap.js
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
NEXT_PUBLIC_DEFAULT_LOCALE=id
```

## Root files

`.nvmrc` (`22`), `.editorconfig` (2 spaces, LF, final newline). `.gitignore` already covers `.env*`, `.next`, `out`.

## `public/`

- `robots.txt`; the Rusuh favicon (replace the generator's `favicon.ico` and remove the sample SVGs).
- `public/fonts/`: `BricolageGrotesque.ttf` (variable, wdth 75–100) and `SpaceGrotesk.ttf` from the HiFi
  (`design/hifi/fonts/`), or WOFF2 subsets of them.

## Gate

```bash
npm install && npx tsc --noEmit && npm audit
```

Fix vulnerabilities with `npm audit fix` (never `--force` without review); list any critical/high left in the spec notes.
