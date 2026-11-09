# Design Document

## Overview

Entities in `core/entities/queue`, two thin services on `queueHttp`, three protocols (`DeviceTokenStoreProtocol`,
`QueuePlaceStoreProtocol`, `TurnstileProtocol`) with their adapters. The device and queue tokens are identifiers
for an anonymous place, not credentials to an account: ADR-0003 keeps them in local storage so a refresh, a new tab or
a restart keeps the same place. Access, refresh and admission tokens stay out of storage.

## Components and Interfaces

```ts
// core/entities/queue/queue.entity.ts
type QueueState = 'preopen' | 'open' | 'paused' | 'closed';
interface QueuePlace { eventId; state; seq: number | null; served?; opensAt?; turnExpiresAt?; serverNow; queueToken; accountAttached? }
interface DeviceRegistration { deviceToken: string; expiresAt: string }

DeviceService({ queueHttp }).registerDevice(turnstileToken) → HttpResponse<DeviceRegistration>
QueueService({ queueHttp }).joinQueue(eventId, deviceToken, turnstileToken) → HttpResponse<QueuePlace>

DeviceTokenStoreProtocol { get(): string | null; set(token): void; clear(): void }
QueuePlaceStoreProtocol { get(eventId): StoredPlace | null; set(eventId, place): void; remove(eventId): void }
TurnstileProtocol { getToken(action: string): Promise<string> }
```

## Layer Constraints

- `src/core/` is pure TypeScript. No React, no Next.js, no Axios, no browser APIs, no infrastructure imports.
- Protocols: pure interfaces with zero imports.
- Services: one aggregate per file, return `HttpResponse<T>`, no transformation, no error catching.
- Adapters are the only place browser APIs and external scripts are used; dependencies come through factory params.

## Correctness Properties

- Property 1: every join and registration carries a fresh Turnstile token (single use). **Validates: Requirements 1, 2**
- Property 2: a broken stored place never crashes the page (read as null). **Validates: Requirements 2**

## Error Handling

The Turnstile adapter rejects with an `HttpRequestError` code `VERIFICATION_UNAVAILABLE`; HTTP errors pass through.

## Testing Strategy

Service tests with a mocked `queueHttp`; adapter tests with a fake storage and a fake `window.turnstile`.
