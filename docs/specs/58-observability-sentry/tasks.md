# Implementation Plan: Observability (Sentry, request ID)

## Tasks

- [x] 1. Config: DSN, environment, sample rates; tests [Requirement 2]
- [x] 2. `X-Request-ID` in the HTTP adapter, `requestId` on errors, frontier cacheable; tests [Requirement 1]
- [x] 3. "Kode bantuan" in the error popup; translations; tests [Requirement 1]
- [x] 4. Sentry sink: lazy core and replay chunks, scrubbing, budget; API error reporter; DI; tests [Requirement 2]
- [x] 5. Deploy workflow and source maps; bundle check [Requirement 3]
- [x] 6. Verified: an API error and an uncaught error from the running app reached Sentry with release, environment
      and request ID; stack frames resolved through uploaded source maps
