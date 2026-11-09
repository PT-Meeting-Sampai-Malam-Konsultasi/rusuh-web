# Implementation Plan: Sign-in auth and account services

## Overview

Types, two thin services and two HTTP flags; the use cases come next (spec 25).

## Tasks

- [x] 1. Auth entities [Requirement 1, Requirement 2]
- [x] 2. `withCredentials` and `skipRefresh` in the HTTP protocol and adapter, with tests [Requirement 3]
- [x] 3. `AuthService` with tests [Requirement 1]
- [x] 4. `AccountService` with tests [Requirement 2]
- [x] 5. DI registration, registry test and the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2], [3, 4], [5]] }
```

## Notes

- Stacked on the FR-04 branch (device token, Turnstile adapter); merge #45 first.
