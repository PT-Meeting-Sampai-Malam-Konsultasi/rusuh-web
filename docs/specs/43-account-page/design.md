# Design Document

Shell `pages/Account/index.tsx`; sections `AccountProfile`, `AccountSignIn`, `AccountAside`; skeleton in the shell's
CSS. Styles from HiFi `account.css` (`.ac`, `.ac-rows`, `.blk-h`, `.no`, `.ac-card`).

## Layer Constraints

From `.claude/rules/presentation.md`:

- Zero hooks and zero logic of their own: `container.resolve<Interface>('xController')` at the top of render, then pass
- Every flow segment has an `error.tsx` (see the error-handling rule).
