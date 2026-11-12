# Implementation Plan: Order attendee check (use case)

## Overview

Add `ValidateAttendeeUseCase` (`src/core/use_case/booking/validate-attendee.use-case.ts`) with a pure `checkNik`
(empty → incomplete → duplicate → invalid-structure → ok; lenient KTP structure rule) and `execute`, which calls
`bookingService.validateAttendee` (spec 53), retries once on a transient failure and returns one typed outcome per
answer. Move `retryAfterOf` to a shared core file, register the use case and test every branch. Writer:
use-case-writer. Depends on spec 53; spec 55 consumes it.

## Tasks

- [ ] 1. Move `retryAfterOf` from `request-sign-in-code.use-case.ts` to `src/core/use_case/shared/retry-after.ts` and import it back (no behaviour change) [Requirement 6]
- [ ] 2. Write `src/core/use_case/booking/validate-attendee.use-case.ts`: `NIK_LENGTH`, `NikCheck`, `checkNik` with the stated order and the lenient structure rule (TSDoc: the server is the authority) [Requirement 1, Requirement 2, Requirement 5]
- [ ] 3. In the same file: `ValidateAttendeeInput`, `ValidateAttendeeResult`, `execute` (token guard, trimmed name, one retry on a transient failure, classification, rethrow of anything else) and the `ValidateAttendeeUseCase` factory [Requirement 3, Requirement 4, Requirement 5, Requirement 6]
- [ ] 4. Register `validateAttendeeUseCase: asFunction(ValidateAttendeeUseCase).singleton()` in `services.registry.ts`, add it to `AwilixRegistry` and to `KEYS` in `registry.test.ts` [Requirement 6]
- [ ] 5. Write `src/core/use_case/booking/__tests__/validate-attendee.use-case.test.ts` per the Testing Strategy (both `checkNik` tables, seeded structure property, every `execute` row, call counts, rethrow identity, no NIK/name in results) [Requirement 1, Requirement 2, Requirement 3, Requirement 4, Requirement 5]
- [ ] 6. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 2], [3], [4, 5], [6]] }
```

## Notes

- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage ≥ 85% on the new file; key count = registration
  count.
- The retry lives here, not in the mutation (design Overview): the controller uses `retry: false`.
- `checkNik` takes the **earlier** tickets only, so only the later field of a repeated pair shows the duplicate (HiFi).
- Open question: `Retry-After` is a header in the contract but the adapter exposes only the body; see design Error
  Handling.
- Commit: `feat(order): [FR-15-W1] add the nik check and dukcapil outcome rules`.
