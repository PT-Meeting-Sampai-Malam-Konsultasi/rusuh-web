# Design Document

## Overview

`toEventCardView` adds a `join` field; `HomeController` adds `selectEvent` (analytics only; navigation is the link)
and `joinHint`.

## Components and Interfaces

```ts
interface EventCardView {
  /* … */ join: { href: string; label: string } | null;
  state: EventState;
}
interface HomeControllerInterface {
  /* … */ selectEvent: (eventId: string, position: number) => void;
  joinHint: string;
}
```

## Data Models

`JOINABLE_STATES` in `src/utils/constants/event-state.ts`, next to `FINISHED_STATES`.

## Layer Constraints

- Return only what the screen needs, already translated or formatted.
- Analytics (`trackPageView` once on mount, `trackEvent` on actions)
- Keep the paths in `src/utils/constants/routes.ts`; never hard-code them in controllers.
- Helper functions defined in the body → `src/utils/` (pure) or a use case (business)

## Correctness Properties

- Property 1: `join !== null` exactly for the three joinable states. **Validates: Requirements 1**
- Property 2: `join.href` is `withQuery(ROUTES.QUEUE, { event: eventId })`. **Validates: Requirements 1**

## Error Handling

None: no API call is added.

## Testing Strategy

Mapper tests per state; controller test for `selectEvent` analytics and `joinHint`.
