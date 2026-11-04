# Design Document

## Overview

`HomeController` wraps `getHomeEventsUseCase` in a query and maps the result to card views with pure formatters in
`src/utils/format/` and the stamp table in `src/utils/constants/event-state.ts`.

## Architecture

`HomeScreen` → `container.resolve('homeController')` → `useQueryTanstack(getHomeEventsUseCase.execute)`.

## Components and Interfaces

```ts
interface EventCardView {
  id: string;
  name: string;
  title: string;
  subtitle?: string;
  kicker?: string;
  imageUrl?: string;
  posterTone: 'blue' | 'pink' | 'paper' | 'ink';
  stamp: { tone: StampTone; label: string };
  dateLine: string;
  venueLine: string;
  priceLine: string;
  priceMuted: boolean;
  note?: string;
  noteDetail?: string;
  posterDate: string;
  posterPlace: string;
}
interface HomeControllerInterface {
  t: TFunction;
  status: 'loading' | 'error' | 'empty' | 'ready';
  featured: EventCardView | null;
  events: EventCardView[];
  countLabel: string;
  errorMessage: string;
  retry: () => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  nav: { href: string; label: string; current: boolean; icon: 'events' | 'queue' | 'tickets' | 'account' }[];
}
```

## Data Models

`HomeEvents` from the use case; `EventCardView` above.

## Layer Constraints

- Return only what the screen needs, already translated or formatted.
- Never `.then()/.catch()`; never `useEffect` + service call (use `useQueryTanstack`, with `refetchInterval` for polling).
- Error display (fallback through the same DI map, no extra import): `ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR` → `t(key)` → `openPopupError()` or a field error.
- `trackPageView` inside `useEffect(..., [])`, not in the render body.
- Registered in `controllers.registry.ts` as `asFunction(Controller)` — **no** `.singleton()`.
- Helper functions defined in the body → `src/utils/` (pure) or a use case (business)

## Correctness Properties

- Property 1: relative times use `serverNow`, never the device clock. **Validates: Requirements 2**
- Property 2: every `EventState` has a stamp tone and label key in both locales. **Validates: Requirements 2**

## Error Handling

| Code                                               | Shown                                                  |
| -------------------------------------------------- | ------------------------------------------------------ |
| `NETWORK_ERROR`                                    | Inline: offline text + "Coba lagi"                     |
| `TIMEOUT`, `INTERNAL_ERROR`, `RATE_LIMITED`, other | Inline: translated `ERROR_CODE_MAP` text + "Coba lagi" |

The list error is shown inline (the page has nothing else to show), not as a popup.

## Testing Strategy

`src/controllers/__tests__/home.controller.test.ts` with fake hooks; `src/utils/format/__tests__/*.test.ts` for the
formatters.
