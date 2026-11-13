# Implementation Plan: Queue live page

> **Updated 13 Nov 2026:** SSE is dropped; the waiting room follows the queue by polling the frontier only. Nothing on
> the page depended on the stream; only the wording about live updates no longer applies.

## Tasks

- [x] 1. Live line in `QueueWaiting` with styles and tests [Requirement 1]
- [x] 2. Gate, browser check at 390 and 1440 (ID, EN), polling and streaming in the mock [ALL]
