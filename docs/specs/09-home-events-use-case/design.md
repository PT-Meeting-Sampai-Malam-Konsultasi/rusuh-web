# Design Document

## Overview

`GetHomeEventsUseCase.execute()` loads the list and returns a `HomeEvents` model. No API errors are expected business
outcomes here, so all of them propagate.

## Architecture

`HomeController` (useQuery) → `getHomeEventsUseCase.execute()` → `catalogService.listEvents()`.

## Components and Interfaces

```ts
export interface GetHomeEventsUseCaseInterface {
  execute: () => Promise<HomeEvents>;
}
export const GetHomeEventsUseCase = ({ catalogService }: Pick<AwilixRegistry, 'catalogService'>): GetHomeEventsUseCaseInterface;
```

## Data Models

```ts
interface HomeEvents {
  featured: EventSummary | null;
  others: EventSummary[];
  total: number;
  serverNow: string;
}
```

## Layer Constraints

- Depend only on services, config and other use cases from `AwilixRegistry`
- Zero React, zero Next.js, zero hooks, zero browser APIs
- Return **typed discriminated unions**; never throw for an expected business outcome
- Catch only the specific `HttpError` codes you classify; re-throw everything else for the controller.
- Return codes, never sentences: the controller maps codes to translation keys.
- Stateless; registered as `asFunction(UseCase).singleton()`; interface added to `AwilixRegistry`.

## Correctness Properties

- Property 1: `others.length + (featured ? 1 : 0) === total === items.length`. **Validates: Requirements 1, 2**
- Property 2: no sold-out or ended event is featured. **Validates: Requirements 2**
- Property 3: the input array is not mutated. **Validates: Requirements 1**

## Error Handling

Every `HttpError` from the service is re-thrown unchanged for the controller.

## Testing Strategy

`src/core/use_case/catalog/__tests__/get-home-events.use-case.test.ts`: ordering, ties, featured rules, empty list,
error propagation.
