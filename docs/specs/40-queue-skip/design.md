# Design Document

## Overview

Controller: `skipping = joined && joined.served !== null && joined.seq !== null && joined.served >= joined.seq` (the
join answer), new status `entering`, window query disabled, a `sign-in` redirect effect. Screen: `QueueEntering`, a
busy view like joining. Mock: placement `no_queue` (0 ahead).

## Layer Constraints

From `.claude/rules/controller.md`:

- Loading overlay (`useLoading`), error popup (`usePopupError`), navigation (`useRouterNext`)
- Return only what the screen needs, already translated or formatted.

From `.claude/rules/presentation.md`:

- Receive all data and callbacks as props, including `t`. Never call `useTranslation()` or `container.resolve()`.

## Testing Strategy

Controller: entering on a no-queue join, not on a later turn; no window read; guest redirect; analytics. Screen: the
entering view. Mock: `no_queue` gives position 0 and admits at once.
