# Design Document

## Overview

Entities plus a one-method service for the catalog aggregate. `getEvent` and `getCategories` join this service later
(FR-11-W1).

## Architecture

`HomeController` → `getHomeEventsUseCase` → `catalogService.listEvents()` → `coreHttp` → `GET {CORE_API_URL}/events`.
The response is cached at the CDN for 5–10 s (`Cache-Control: public, max-age=5, stale-while-revalidate=30`).

## Components and Interfaces

```ts
export interface CatalogServiceInterface {
  listEvents: () => Promise<HttpResponse<ListEventsResponse>>;
}
export const CatalogService = ({ coreHttp }: Pick<AwilixRegistry, 'coreHttp'>): CatalogServiceInterface;
```

## Data Models

```ts
type EventState =
  'coming_soon' | 'waiting_room_open' | 'on_sale' | 'almost_gone' | 'temporarily_full' | 'sold_out' | 'ended';
interface Money {
  amount: number;
  currency: 'IDR';
}
interface EventSummary {
  eventId: string;
  name: string;
  venue: string;
  startsAt: string;
  state: EventState;
  subtitle?: string;
  format?: string;
  venueShort?: string;
  city?: string;
  timezone?: string;
  doorsOpenAt?: string;
  saleOpensAt?: string;
  waitingRoomOpensAt?: string;
  saleEndsAt?: string;
  priceFrom?: Money;
  capacity?: number;
  soldOutAt?: string | null;
  imageUrl?: string;
}
interface ListEventsResponse {
  items: EventSummary[];
  serverNow: string;
}
```

## Layer Constraints

- Types only: request (`…Request`), response (`…Response`), domain models (plain names). No classes, no runtime code.
- Optional fields (`?`) only where the contract makes them optional.
- Money is whole rupiah (`number`); times are ISO strings from the server.
- Depend only on `http` (and `config`) from `AwilixRegistry`.
- Always return `HttpResponse<T>`.
- No transformation (that is a use case), no try/catch: let `HttpError` propagate.
- Registered as `asFunction(Service).singleton()` in `services.registry.ts`; interface added to `AwilixRegistry`.

## Correctness Properties

- Property 1: `listEvents` issues exactly one `GET events` on `coreHttp`. **Validates: Requirements 2**
- Property 2: an `HttpError` from `coreHttp` reaches the caller unchanged. **Validates: Requirements 2**

## Error Handling

None in this layer: errors propagate to the controller.

## Testing Strategy

`src/core/services/__tests__/catalog.service.test.ts` with a mocked `coreHttp`; the registry test covers registration.
