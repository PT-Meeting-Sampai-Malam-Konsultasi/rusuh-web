# Requirements Document

## Introduction

Shows the live line under the big number (FR-07-W1, rusuh-web#7), as the HiFi `.wr-eta em`: "Diperbarui 2 detik
lalu · 310 orang masuk / menit". The bold ETA before it is FR-09-W1.

## Requirements

### Requirement 1: Live line

#### Acceptance Criteria

- SHALL render `waiting.updated`, then `·` and `waiting.rate` when present, between the number and the track
- SHALL style it as the HiFi: 15 px, `ink-2`, 24 px above (13 px and 18 px below 720 px)
- SHALL NOT announce it every second: the line sits in the polite region with `aria-live="off"`
