# Design Document

```ts
export interface SignOutUseCaseInterface {
  execute: () => Promise<{ revoked: boolean }>;
}
```

Deps: `authService`, `tokenStore`.

## Layer Constraints

From `.claude/rules/core-use-case.md`:

- Return **typed discriminated unions**; never throw for an expected business outcome
- Stateless; registered as `asFunction(UseCase).singleton()`; interface added to `AwilixRegistry`.
