# Implementation Plan: Real API integration

## Tasks

- [x] 1. Account reads `/auth/profile`; mock serves it [Requirement 1]
- [x] 2. Core paths under `/core`, devices under `/queue/devices`; mock and tests follow [Requirement 1]
- [ ] 3. Staging against the real API (blocked on CORS, queue events and `X-Request-ID` on the queue service)
