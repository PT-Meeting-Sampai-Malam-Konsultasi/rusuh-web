# Implementation Plan: Login controller

## Overview

One controller for the whole sign-in flow; pure helpers in `src/utils/`.

## Tasks

- [x] 1. Pure helpers: safe `next` path, event id from `next`, code countdown format, with tests [Requirement 2, Requirement 3]
- [x] 2. `LoginController`: steps, e-mail form, request-code mutation [Requirement 1, Requirement 4]
- [x] 3. Code field, verify mutation, resend and timers [Requirement 1, Requirement 2]
- [x] 4. Profile form and save mutation [Requirement 1]
- [x] 5. Event aside, analytics, translations and error codes [Requirement 3, Requirement 4]
- [x] 6. Tests, DI registration and the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1], [2], [3, 4, 5], [6]] }
```

## Notes

- The order-page sign-in sheet reuses the section components of spec 27 once #42 is merged.
