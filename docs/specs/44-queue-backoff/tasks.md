# Implementation Plan: Queue backoff

> **Updated 13 Nov 2026:** SSE is dropped; the waiting room follows the queue by polling the frontier only.
> `pollDelayMs` lost its `fellBack` argument; the backoff itself is unchanged.

## Tasks

- [x] 1. `pollDelayMs` failures with tests [Requirement 1]
- [x] 2. Controller: failures in a row; claim retry and pressable button; tests [Requirements 1, 2]
- [x] 3. Gate and browser check: offline, 503s, back online [ALL]
