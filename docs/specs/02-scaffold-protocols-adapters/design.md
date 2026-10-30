# Design Document

## Overview

Contracts in core, implementations in infrastructure; only adapters import libraries (Axios, fetch streams).

## Architecture

Adapters are factories receiving their options; the DI registry (step 3) wires them with config. createConfig() is called by the registry, not at module load, so tests never need real env values.

## Components and Interfaces

```ts
createHttpAdapter({ baseUrl, timeoutMs, getAccessToken?, getLocale?, refreshSession?, transport? }): HttpProtocol
createStorageAdapter(store?): StorageProtocol
createTokenStore(): TokenStoreProtocol
createAnalyticsAdapter(sink?): AnalyticsProtocol
createQueueStreamAdapter({ baseUrl, firstEventTimeoutMs?, silenceTimeoutMs?, fetchImpl? }): QueueStreamProtocol
createConfig(env?): AppConfig
```

## Data Models

```ts
interface HttpError {
  status: number;
  code: string;
  message: string;
  data?: unknown;
  traceId?: string;
}
```

## Layer Constraints

From .claude/rules/core-service.md: protocols have zero imports; adapters are the only place libraries are imported; adapters receive config through factory params. From scaffold.md: process.env only in config.ts, read literally.

## Correctness Properties

Property 1: Every rejected request is an HttpError with a non-empty code
**Validates: Requirements 3**

Property 2: A 401 triggers at most one refresh per request
**Validates: Requirements 3**

Property 3: The stream never calls onFallback after close()
**Validates: Requirements 4**

## Error Handling

Build-time only: the gate check fails.

## Testing Strategy

Vitest: transport-stubbed Axios tests, broken-storage tests, SSE parsing and fake-timer fallbacks. Gate: npx tsc --noEmit (+ tests pass).
