# Requirements Document

> **Updated 13 Nov 2026:** SSE is dropped; the waiting room follows the queue by polling the frontier only.
> `pollDelayMs` lost its `fellBack` argument; the backoff itself is unchanged.

## Introduction

NFR-01-W1 (rusuh-web#24): graceful states. The offline banner, the error boundaries and the paused queue exist since
the scaffold and FR-07; a browser check on 10 Nov confirmed that offline keeps the last number with "Diperbarui n
detik lalu" and pauses requests. Two gaps against App Flow §5 "retry with backoff; never drop the place":

1. While the queue service fails (5xx), every device kept polling every 2–10 s.
2. A claim that fails with a server error left "Pilih tiket sekarang" busy for good.

## Requirements

### Requirement 1: Poll backoff

- WHEN polls fail in a row THEN the interval SHALL double per failure (×2, ×4, …), capped at 60 s, with the jitter
- WHEN a poll succeeds THEN SHALL go back to the normal interval
- SHALL keep the last place and the "Diperbarui" line meanwhile (unchanged)

### Requirement 2: Claim retry

- A claim that throws (5xx, network) SHALL be retried 3 times, after 1 s, 2 s and 4 s
- WHEN it still fails THEN "Pilih tiket sekarang" SHALL be pressable again (not busy) to retry by hand
