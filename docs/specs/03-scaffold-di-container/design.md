# Design Document

## Overview

Container, registry type, four registries, registerAll().

## Architecture

infrastructure.registry registers config (createConfig()), storage, tokenStore, analytics, queueHttp, coreHttp, queueStream, the framework hooks and the context hooks. services/controllers registries start empty and grow per feature.

## Components and Interfaces

```ts
registerAll(): void
container.resolve<K extends keyof AwilixRegistry>(key)
```

## Data Models

None beyond the interfaces above.

## Layer Constraints

From .claude/rules/scaffold.md: four-registry order; adapters/services .singleton(); controllers never .singleton(); hooks asValue(realHook); every AwilixRegistry key registered.

## Correctness Properties

Property 1: Registered keys == AwilixRegistry keys
**Validates: Requirements 3**

Property 2: registerAll is idempotent
**Validates: Requirements 2**

## Error Handling

Build-time only: the gate check fails.

## Testing Strategy

registry.test.ts lists all keys with `satisfies Record<keyof AwilixRegistry, true>` and compares with container.registrations. Gate: npx tsc --noEmit.
