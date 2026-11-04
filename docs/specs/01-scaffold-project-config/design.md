# Design Document

## Overview

Configuration only; no application code.

## Architecture

tsconfig paths are shared with Vitest through vite-tsconfig-paths. Fonts live in public/fonts and are loaded with next/font/local in step 4.

## Components and Interfaces

```ts
// tsconfig paths
"@core/*": ["./src/core/*"], "@infrastructure/*": ["./src/infrastructure/*"], ...
```

## Data Models

None beyond the interfaces above.

## Layer Constraints

From .claude/rules/scaffold.md: path aliases table; keep output: "export"; no cacheComponents/partialPrefetching.

## Correctness Properties

Property 1: Every alias in tsconfig resolves in Vitest too
**Validates: Requirements 1**

Property 2: npm run build still produces a static export
**Validates: Requirements 2**

## Error Handling

Build-time only: the gate check fails.

## Testing Strategy

Gate: npm install && npx tsc --noEmit.
