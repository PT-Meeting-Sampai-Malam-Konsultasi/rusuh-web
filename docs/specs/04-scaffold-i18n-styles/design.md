# Design Document

## Overview

i18n instance, locale files, src/styles/app.css, src/app/fonts.ts; layout imports them.

## Architecture

Locale files are imported statically (no runtime fetch). The saved locale is applied on the client after mount (step 6 providers).

## Components and Interfaces

```ts
export type Locale = 'id' | 'en';
export default i18n; // initialised once
```

## Data Models

None beyond the interfaces above.

## Layer Constraints

From .claude/rules/scaffold.md and design-system.md: flat snake_case keys in one namespace; tokens port the HiFi exactly; square corners; offsets 0 blur.

## Correctness Properties

Property 1: id and en keys are identical
**Validates: Requirements 1**

Property 2: Every ErrorCode in openapi.yaml has error_<code> in both files
**Validates: Requirements 1**

## Error Handling

Build-time only: the gate check fails.

## Testing Strategy

i18n.test.ts: key parity, error-code coverage, language switch. Gate: npx tsc --noEmit (+ build to confirm fonts and CSS compile).
