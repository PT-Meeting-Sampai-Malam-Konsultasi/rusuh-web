# Design Document

## Overview

src/app/layout.tsx, providers.tsx, error.tsx, global-error.tsx, not-found.tsx, page.tsx; StatusScreen; NotFound screen and controller.

## Architecture

layout (server) → Providers (client) → route file → page shell (client) → controller (DI). Fallbacks avoid DI and API calls except logging in an effect.

## Components and Interfaces

```ts
NotFoundController({ analyticsAdapter, useTranslation }): { t; homeHref }
StatusScreen({ title, body, note?, children? })
```

## Data Models

None beyond the interfaces above.

## Layer Constraints

From presentation.md and error-handling.md: route files are thin server components; page shells resolve the controller at the top of render; error files take { error, retry } in this Next.js version; fallbacks are static.

## Correctness Properties

Property 1: The static export builds with scoped CSS module classes in the HTML
**Validates: Requirements 1, 2, 3**

Property 2: notFoundController is registered and listed in AwilixRegistry
**Validates: Requirements 3**

## Error Handling

Build-time only: the gate check fails.

## Testing Strategy

StatusScreen, NotFoundScreen (mocked container) and NotFoundController (renderHook) tests; screenshots at 1440 and 390. Gate: npm run build.
