# Design Document

## Overview

`LoginScreen` resolves `loginController` and renders `AppHeader` (no nav, as in the HiFi), the step section
(`LoginEmail`, `LoginCode`, `LoginProfile`), `LoginEvent` and `LoginNotes`, then `AppFooter`. Sections are
props-in/JSX-out so the order-page sheet can reuse `LoginEmail`, `LoginCode` and `LoginProfile`.

## Components and Interfaces

```ts
LoginEmail({ t, form });
LoginCode({ t, code }); // CodeInput inside: six inputs, paste/autofill aware
LoginProfile({ t, form });
LoginEvent({ event, label }); // Poster (hero) on desktop, banner on phones
LoginNotes({ t });
```

## Layer Constraints

- Receive all data and callbacks as props, including `t`. Never call `useTranslation()` or `container.resolve()`
  (except the screen, which resolves its controller).
- Every `.tsx` has a co-located `.module.css` starting with `@reference`; no Tailwind class strings in JSX.
- Mobile first; interactive elements define hover, focus-visible, disabled and pressed states.

## Correctness Properties

- Property 1: pasting "482 019" into any box fills all six boxes with `482019`. **Validates: Requirements 2**
- Property 2: exactly one `h1` per step. **Validates: Requirements 1, 2**

## Error Handling

Messages come translated from the controller; the segment `error.tsx` offers "Coba lagi" and Home.

## Testing Strategy

Component tests per section (typing, paste, Backspace, states), shell test with a mocked controller, mock handler
tests; browser check at 390 and 1440, ID and EN, for e-mail, code, wrong, expired, locked and profile.
