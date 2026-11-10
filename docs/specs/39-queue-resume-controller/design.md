# Design Document

## Overview

A ref marks the next join as a rejoin; `queueAgain` sets it and refetches. The status already passes join kinds
through, so `missed` shows `QueueMissed`.

## Layer Constraints

From `.claude/rules/controller.md`:

- Queries and mutations wrapping use cases or services (`useQueryTanstack`, `useMutationTanstack`)

## Testing Strategy

`missed` from the join, rejoin flag on "Antre lagi" only, resumed analytics.
