# Design Document

## Overview

src/contexts, src/presentation/components, src/utils/constants.

## Architecture

Context hooks are registered in DI as asValue(hook); controllers call them. The popup context separates the controller API (open/close) from the shell API (current popup).

## Components and Interfaces

```ts
useLoading(): { isLoading; toggleLoading }
usePopupError(): { openPopupError({ title?, message, actionLabel?, onAction? }); closePopupError }
useNetworkStatus(): { isOnline }
```

## Data Models

None beyond the interfaces above.

## Layer Constraints

From presentation.md and design-system.md: props in, JSX out; CSS modules with @reference + @apply; no Tailwind classes in JSX; square corners, hard offsets; ≥44px targets; role/aria for timer, alert, status.

## Correctness Properties

Property 1: Every ErrorCode maps to a key present in both locales
**Validates: Requirements 3**

Property 2: No placeholder hooks remain in the registries
**Validates: Requirements 1**

## Error Handling

Build-time only: the gate check fails.

## Testing Strategy

Vitest + Testing Library for every context, component and the constants. Gate: npx tsc --noEmit && npx vitest --run.
