# Design Document

## Overview

One `<p>` in `QueueWaiting`, styled in `queue-waiting.module.css`.

## Layer Constraints

From `.claude/rules/presentation.md`:

- Zero hooks and zero logic of their own: `container.resolve<Interface>('xController')` at the top of render, then pass
- One shell per page, co-located `{page-name}.module.css`.

## Testing Strategy

`QueueWaiting` test: the line shows updated and rate, and only updated when rate is null.
