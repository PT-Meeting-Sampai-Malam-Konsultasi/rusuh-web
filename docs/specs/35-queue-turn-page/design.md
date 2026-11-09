# Design Document

## Overview

Two sections, `QueueTurn` and `QueueMissed`, in the room layout (event aside kept, notes hidden). Shared `Timer`,
`Button`, `ButtonLink`; `queue-view.module.css` for lead, shout, copy and actions.

## Layer Constraints

From `.claude/rules/presentation.md`:

- Receive all data and callbacks as props, including `t`. Never call `useTranslation()` or `container.resolve()`.
- Live regions: the queue number and ETA (`aria-live="polite"`), field errors (`role="alert"`), timers (`role="timer"`).

## Testing Strategy

Each view's copy and action for signed-in, guest and claiming; the shell shows them for `turn` and `missed`.
