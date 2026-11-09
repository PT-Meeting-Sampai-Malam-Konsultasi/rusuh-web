# Implementation Plan: Login page

## Overview

Route, screen, five sections, the code input, and the auth mock.

## Tasks

- [x] 1. Auth mock handlers with tests [Requirement 3]
- [x] 2. `CodeInput` component with tests [Requirement 2]
- [x] 3. `LoginEmail`, `LoginCode`, `LoginProfile` sections with tests [Requirement 1, Requirement 2]
- [x] 4. `LoginEvent`, `LoginNotes` and the `LoginScreen` shell with tests [Requirement 1]
- [x] 5. Route, `error.tsx`, metadata [Requirement 1]
- [x] 6. Gate check (typecheck, tests, build) and browser check at 390 / 1440, ID / EN [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2], [3, 4], [5], [6]] }
```

## Notes

- HiFi copy fixes: 10-minute validity and 5 attempts (ADR-0006); no NIK field and no presale opt-in (D17).
