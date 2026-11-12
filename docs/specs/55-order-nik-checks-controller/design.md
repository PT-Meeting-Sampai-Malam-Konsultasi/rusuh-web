# Design Document

## Overview

`OrderController` (`src/controllers/order.controller.ts`) is extended, not replaced. Additions:

1. **Two new deps:** `validateAttendeeUseCase` (spec 54) and `useMutationTanstack`.
2. **Per-slot state:** `checks` (the check run per slot key: exact values + phase/result) and `touchedNik` (slot keys
   whose NIK field was blurred once). Both are `useState` records keyed by slot key.
3. **One mutation** (`nikCheck`) for every slot; options-level `onMutate` / `onSuccess` / `onError` receive the
   variables, so each result lands on its own slot even when two slots check at once.
4. **Derived field state** in the existing `holders` `useMemo`: local check → touched/focus → matching run → `error` /
   `valid` / `checking` / `canRecheck`, translated.
5. **Triggers:** NIK blur, name blur, choosing "Saya sendiri", and `recheck()`.
6. **Resets:** NIK/name change and holder-type change drop the slot's run; removing tickets drops runs and touched flags of
   slots that no longer exist.
7. **`allHoldersVerified`** and the `order_nik_checked` analytics event.

**No loading overlay (difference from the controller rule).** The rule asks for `toggleLoading()` in all three mutation
paths. That rule is for blocking actions; a field check must leave the page usable (the buyer keeps filling other
tickets while Dukcapil answers, ADR-0007 consequence "up to 3 Dukcapil checks per order"). The per-field `checking` state
replaces the overlay, so `useLoading` is not a dependency and `toggleLoading` is never called.

**`retry: false` (difference from the brief).** The brief puts a `retryTransientOnce`-like retry on the mutation, but
spec 54 returns `unavailable` as a value, so TanStack would never retry. The single retry is in the use case (spec 54
Overview).

**HiFi difference.** HiFi field 1 shows "✓ Format NIK valid" for a locally correct NIK. ADR-0007 requires every name +
NIK to be checked against Dukcapil, and the hold needs the validation token, so a format-only tick would look like a
finished check. This design shows no message for a locally correct NIK (the example hint stays) and "✓ Nama dan NIK cocok
dengan Dukcapil." only after the server says `valid`. The HiFi duplicate copy is used as is (with the ticket number as a
variable).

## Architecture

```
OrderScreen ─► container.resolve('orderController')          (src/infrastructure/di/controllers/order.ts, unchanged)
  │
  ├─ queries (event, categories, me), selection, limitNotice  unchanged
  ├─ holderValues (useWatch), focusedNik                      unchanged
  ├─ checks: Record<slotKey, NikCheckRun>                      ← new useState
  ├─ touchedNik: Record<slotKey, true>                         ← new useState
  ├─ nikCheck = useMutationTanstack<ValidateAttendeeResult, HttpError, NikCheckVariables>({
  │     mutationFn: (v) => validateAttendeeUseCase.execute({ eventId, admissionToken: admissionStore.get(eventId), …v }),
  │     retry: false,
  │     onMutate:  (v) → checks[v.slotKey] = { nik, fullName, phase: 'checking' }
  │     onSuccess: (r, v) → admission-invalid ? router.replace(queue) :
  │                         trackEvent('order_nik_checked', { outcome: r.kind }); store r if checks[v.slotKey] still matches v
  │     onError:   (e, v) → store { phase: 'failed', code: e.code } if still matches v
  │   })
  ├─ holders (useMemo): per slot
  │     local = validateAttendeeUseCase.checkNik(digits, earlierDigits)
  │     run   = checks[slot.key] if run.nik === digits && run.fullName === fullName
  │     → nik.{ error, valid, checking, canRecheck, recheck }, name.onBlur, nik.onBlur
  └─ allHoldersVerified = holders.length > 0 && every slot state is 'valid'
```

API operation: `validateAttendee` through the use case (spec 54 → spec 53). Existing operations unchanged.

## Components and Interfaces

```ts
// src/controllers/order.controller.ts (changes; everything else unchanged)
import type { ValidateAttendeeResult } from '@core/use_case/booking/validate-attendee.use-case';

export interface OrderHolderNameField {
  id: string;
  value: string;
  readOnly: boolean;
  hint: string;
  onChange: (value: string) => void;
  /** Starts the Dukcapil check when the NIK is already locally ok. */
  onBlur: () => void; // ← new
}

export interface OrderHolderNikField {
  id: string;
  /** Raw digits while focused; masked ("3174 •••• •••• 0004") otherwise. */
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  /** Marks the field touched and starts the Dukcapil check when locally ok with a name. */
  onBlur: () => void;
  /** Translated field error (local or Dukcapil); undefined when none. */
  error?: string; // ← new
  /** "Nama dan NIK cocok dengan Dukcapil." after a valid check; undefined otherwise. */
  valid?: string; // ← new
  /** A check for the current values is in flight. */
  checking: boolean; // ← new
  /** The last check failed in a retryable way (busy, rate limited, unknown): show "Periksa lagi". */
  canRecheck: boolean; // ← new
  /** Runs the check again with the current values; no-op unless canRecheck. */
  recheck: () => void; // ← new
}

export interface OrderControllerInterface {
  // …all existing fields unchanged…
  /** Every ticket holder passed the Dukcapil check (≥ 1 holder). For the payment button (FR-16+). */
  allHoldersVerified: boolean; // ← new
}

type OrderControllerDeps = Pick<
  AwilixRegistry,
  | 'catalogService'
  | 'accountService'
  | 'getOrderCategoriesUseCase'
  | 'orderTicketSelectionUseCase'
  | 'validateAttendeeUseCase' // ← new
  | 'admissionStore'
  | 'analyticsAdapter'
  | 'storage'
  | 'ERROR_CODE_MAP'
  | 'useTranslation'
  | 'useQueryTanstack'
  | 'useMutationTanstack' // ← new
  | 'useRouterNext'
  | 'useSearchParamsNext'
>;
```

Module-scope types (not exported):

```ts
/** What the mutation sends for one slot. fullName is the raw form value (the use case trims it). */
interface NikCheckVariables {
  slotKey: string;
  fieldIndex: number;
  fullName: string;
  nik: string;
}

/** The check run of one slot, for exactly these values. */
type NikCheckRun =
  | { nik: string; fullName: string; phase: 'checking' }
  | { nik: string; fullName: string; phase: 'done'; result: ValidateAttendeeResult }
  | { nik: string; fullName: string; phase: 'failed'; code: string };

type NikCheckState = 'idle' | 'checking' | 'valid' | 'error';
```

Schema change (comment only; the type stays `z.string()`):

```ts
/** Digits only (toNikDigits on change); every NIK rule is in validateAttendeeUseCase (FR-15-W1). */
nik: z.string(),
```

Body outline (no new import besides the types; `useState`, `useMemo`, `useRef` are already imported):

- `startCheck(slotKey, force)`: read `formApi.getValues('holders')`, find the entry and its slot in `selection.slots`;
  `earlier` = digits of the entries for the slots before it; `local = checkNik(entry.nik, earlier)`; stop unless
  `local.kind === 'ok'` and `entry.fullName.trim() !== ''`; stop if `checks[slotKey]` has the same `nik` + `fullName` and
  is `checking`, or (unless `force`) any phase for the same values; else `nikCheck.mutate({ slotKey, fieldIndex:
slot.index − 1, fullName: entry.fullName, nik: entry.nik })`.
- `dropRun(slotKey)`: `setChecks` without that key (returns the same object when the key is absent).
- `nik.onChange` / `name.onChange`: existing `setValue`, then `dropRun(slot.key)`.
- `choose(next)`: existing `setHolderType`; on `changed`, `setValue`, `dropRun(slot.key)`, then `startCheck` when `next`
  is `'self'` (the profile name is now the value).
- `nik.onBlur`: existing focus reset, `setTouchedNik` adds the key, `startCheck(slot.key, false)`.
- `name.onBlur`: `startCheck(slot.key, false)`.
- `recheck`: `canRecheck ? startCheck(slot.key, true) : noop`.
- `applyQuantities`: existing code, then drop `checks` and `touchedNik` keys not in `nextSlots`.
- `onSuccess`: `admission-invalid` → guarded `router.replace(withQuery(ROUTES.QUEUE, { event: eventId }))` (reuses the
  `redirected` ref), return. Otherwise `trackEvent('order_nik_checked', { outcome: result.kind })`, then `setChecks(prev
=> prev[v.slotKey] is checking with v.nik and v.fullName ? { …prev, [v.slotKey]: { …, phase: 'done', result } } : prev)`.
- `onError(error, v)`: same guard, `{ phase: 'failed', code: error.code }`. No analytics, no popup, no `reportError`
  (the error's `cause` may hold the request body with the NIK).

Field state per slot (inside `holders`), first match wins:

| #   | Condition                                                 | state      | error / valid                                                            | canRecheck |
| --- | --------------------------------------------------------- | ---------- | ------------------------------------------------------------------------ | ---------- |
| 1   | local `duplicate`                                         | `error`    | `order_nik_duplicate` `{ index }`                                        | false      |
| 2   | local `incomplete` and touched and not focused            | `error`    | `order_nik_incomplete`                                                   | false      |
| 3   | local `invalid-structure` and touched and not focused     | `error`    | `order_nik_invalid_structure`                                            | false      |
| 4   | local not `ok` (empty, or 2/3 while focused or untouched) | `idle`     | —                                                                        | false      |
| 5   | no run, or run values ≠ current `{ nik, fullName }`       | `idle`     | —                                                                        | false      |
| 6   | run `checking`                                            | `checking` | —                                                                        | false      |
| 7   | run `done` `valid`                                        | `valid`    | valid: `order_nik_valid`                                                 | false      |
| 8   | run `done` `nik-invalid`                                  | `error`    | `error_nik_invalid`                                                      | false      |
| 9   | run `done` `seat-taken`                                   | `error`    | `error_nik_seat_taken` + " " + `order_nik_use_another`                   | false      |
| 10  | run `done` `duplicate`                                    | `error`    | `error_duplicate_nik`                                                    | false      |
| 11  | run `done` `rate-limited` (seconds n / null)              | `error`    | `order_nik_rate_limited` `{ count: n }` / `order_nik_rate_limited_later` | true       |
| 12  | run `done` `unavailable`                                  | `error`    | `order_nik_unavailable`                                                  | true       |
| 13  | run `failed` (code)                                       | `error`    | `ERROR_CODE_MAP[code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR`                   | true       |

(`admission-invalid` is never stored: it redirects.) `allHoldersVerified = holders.length > 0 && every state === 'valid'`
(computed from the same per-slot states, kept next to the views in the `useMemo`).

Compile check: `ValidateAttendeeResult` is a type-only import (controller rule). `AwilixRegistry.validateAttendeeUseCase`
exists after spec 54; `useMutationTanstack: typeof useMutation` gives
`useMutation<ValidateAttendeeResult, HttpError, NikCheckVariables>` with `onMutate(variables)`,
`onSuccess(data, variables)` and `onError(error, variables)`. `OrderControllerInterface` widens; the DI registration
`asFunction(OrderController)` is unchanged. The shell and `HolderList` test fixtures must gain `allHoldersVerified`,
`name.onBlur`, `nik.checking`, `nik.canRecheck`, `nik.recheck` (task 4) or `tsc` fails.

## Data Models

Translation keys used by this controller. **They are written to `src/translation/locale/id.json` and `en.json` by spec
56 task 1** (the page spec owns the copy for this ticket); spec 55 and 56 land in the same PR. `_one` / `_other`: i18next
picks from `count`; ID keeps both for key parity (like `order_category_note_one`).

| Key                                 | ID                                                                                   | EN                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `order_nik_incomplete`              | NIK terdiri dari 16 digit.                                                           | A NIK has 16 digits.                                                                 |
| `order_nik_invalid_structure`       | Susunan angka ini bukan NIK KTP. Periksa lagi.                                       | These digits don't follow the KTP NIK pattern. Please check them.                    |
| `order_nik_duplicate`               | NIK ini sudah dipakai di Tiket {{index}}. Setiap tiket butuh NIK orang yang berbeda. | This NIK is already on Ticket {{index}}. Each ticket needs a different person's NIK. |
| `order_nik_checking`                | Memeriksa ke Dukcapil…                                                               | Checking with Dukcapil…                                                              |
| `order_nik_valid`                   | Nama dan NIK cocok dengan Dukcapil.                                                  | Name and NIK match Dukcapil's records.                                               |
| `order_nik_use_another`             | Gunakan NIK pemegang lain.                                                           | Use another holder's NIK.                                                            |
| `order_nik_rate_limited_one`        | Terlalu banyak percobaan untuk tiket ini. Coba lagi dalam {{count}} detik.           | Too many tries for this ticket. Try again in {{count}} second.                       |
| `order_nik_rate_limited_other`      | Terlalu banyak percobaan untuk tiket ini. Coba lagi dalam {{count}} detik.           | Too many tries for this ticket. Try again in {{count}} seconds.                      |
| `order_nik_rate_limited_later`      | Terlalu banyak percobaan untuk tiket ini. Coba lagi sebentar lagi.                   | Too many tries for this ticket. Please try again in a moment.                        |
| `order_nik_unavailable`             | Dukcapil sedang sibuk. Coba periksa lagi.                                            | Dukcapil is busy right now. Please check again.                                      |
| `order_nik_recheck` (page, spec 56) | Periksa lagi                                                                         | Check again                                                                          |

Existing keys reused: `error_nik_invalid`, `error_nik_seat_taken`, `error_duplicate_nik`, and every `error_*` key through
`ERROR_CODE_MAP` (all present in both files).

**Copy status:** `order_nik_duplicate` is the HiFi line 35 copy. `order_nik_valid`, `order_nik_checking`,
`order_nik_unavailable`, `order_nik_rate_limited*` are from the brief; `order_nik_incomplete`,
`order_nik_invalid_structure` and `order_nik_use_another` are proposed (no HiFi frame; "use another attendee" is customer
journey F23 / D-3). Confirm with the designer. The rate-limit seconds are the server's number at answer time, not a
ticking countdown (a countdown would need server time, out of scope).

Example (slots `B-1`, `B-2`, `D-1`; A = `3174055203960004`):

| Ticket 1          | Ticket 2                  | Ticket 3       | States (1 / 2 / 3)                                     | allHoldersVerified |
| ----------------- | ------------------------- | -------------- | ------------------------------------------------------ | ------------------ |
| A, "Nadia", valid | A (typing)                | ''             | valid / error duplicate "Tiket 1" / idle               | false              |
| A, "Nadia", valid | `…0001` blurred, checking | `3174` blurred | valid / checking / error incomplete                    | false              |
| A valid           | `…8888` done              | `…7777` done   | valid / error seat-taken / error unavailable + recheck | false              |
| valid             | valid                     | valid          | valid ×3                                               | true               |

## Layer Constraints

From `.claude/rules/controller.md`:

- Page UI state (`useState`), form state (`useForm` + Zod, `useWatch`)
- Queries and mutations wrapping use cases or services (`useQueryTanstack`, `useMutationTanstack`)
- Loading overlay (`useLoading`), error popup (`usePopupError`), navigation (`useRouterNext`)
- Translation of codes into text (`t` from `useTranslation`)
- Analytics (`trackPageView` once on mount, `trackEvent` on actions)
- Business rules, validation, data transformation → use case
- Helper functions defined in the body → `src/utils/` (pure) or a use case (business)
- ✅ import type { ... } from '@core/...';
- ❌ import { useQuery, useMutation } from '@tanstack/react-query'; // DI: useQueryTanstack, useMutationTanstack
- ❌ any runtime import from @core/services, @infrastructure, or a context
- `export default` the factory; named export the interface `{Page}ControllerInterface`.
- Return only what the screen needs, already translated or formatted.
- `toggleLoading()` in **all three** mutation paths: `mutationFn`, `onSuccess`, `onError`. A missing one leaves the
  overlay stuck.
- One query or mutation per async operation. Never call a service inside another mutation's `onSuccess`/`onError`.
- Never `.then()/.catch()`; never `useEffect` + service call (use `useQueryTanstack`, with `refetchInterval` for polling).
- Error display (fallback through the same DI map, no extra import): `ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR` → `t(key)` → `openPopupError()` or a field error.
  `401` goes to sign-in; `NETWORK_ERROR` shows the offline message.
- `useWatch` for reactive form values; never `watch()` (React 19 re-render issue).
- Registered in its own `src/infrastructure/di/controllers/{page-name}.ts` as `asFunction(Controller)` — **no**
  `.singleton()` — and that file is imported by the page shell, never by `registerAll()` (see scaffold rule).
- Mock every DI dependency (hooks return plain objects); capture `useMutationTanstack` options and call
  `mutationFn` / `onSuccess` / `onError` directly.
- Test: returned interface, loading in all paths, error mapping, navigation targets, analytics.
- Coverage threshold 85%.
- [ ] No `.then(`, `.catch(`, or `useEffect` with a service call
- [ ] No direct imports of framework or context hooks
- [ ] No business logic or helpers in the body
- [ ] One query/mutation per async operation
- [ ] `toggleLoading()` in all three mutation paths
- [ ] Every destructured DI key has a `container.register()` call
- [ ] The screen needs nothing beyond the returned interface

Deviations recorded: no `toggleLoading` (field check, see Overview); a 401 from the check shows `error_unauthorized`
under the field instead of going to sign-in, like the categories query today (the login sheet is NFR-07-W2).

From `.claude/rules/error-handling.md`:

- Field-level codes (`NIK_INVALID`, `DUPLICATE_NIK`, `NIK_SEAT_TAKEN`, `WRONG_CODE`…) show under the field, not in a popup.
- Every code the endpoint can return (see `openapi.yaml`) has an entry in `ERROR_CODE_MAP` and both locale files.
- ❌ Technical messages to users
- ❌ Auto-retrying mutations without the user

(The one automatic retry is the use case's F10 step on a transient failure; after it the user retries with "Periksa
lagi".)

From `.claude/rules/core-use-case.md` (when to create one):

| Scenario                                                  | Use case? |
| --------------------------------------------------------- | --------- |
| Multi-step flow, business validation, branching on status | Yes       |

From `.claude/rules/scaffold.md`:

- Resources: `src/translation/locale/id.json` and `en.json`, same keys in both, flat `snake_case`, single namespace.
- Copy comes from the HiFi / Design Brief voice rules; write ID first, then a full EN translation.

From `CLAUDE.md`:

- Errors from the API carry a stable `code`; map it to a translation key, never show raw messages.
- NIKs are shown masked after entry and never logged.

## Correctness Properties

- Property 1: for each row of the field-state table, the holder view has exactly that `error` / `valid` / `checking` /
  `canRecheck` (t mocked as `key:JSON(options)`). **Validates: Requirements 1, 4**
- Property 2: typing an incomplete or structurally invalid NIK shows no error while focused or before the first blur; the
  same value after a blur shows it; refocusing hides it again. A duplicate shows while focused.
  **Validates: Requirements 1**
- Property 3: with tickets 1 and 2 holding the same 16 digits, only ticket 2 has `error` (index 1); ticket 1 is unaffected;
  editing ticket 1 to another NIK clears ticket 2's duplicate. **Validates: Requirements 1, 3**
- Property 4: `mutate` is called on NIK blur, name blur and choosing "self" only when the local check is `ok` and the
  trimmed name is non-empty, with `fieldIndex = slot.index − 1`; never for empty/incomplete/invalid/duplicate NIKs or a
  blank name; never twice for the same values (blur again after a result does nothing). **Validates: Requirements 2**
- Property 5: `mutationFn` reads `admissionStore.get(eventId)` at call time and passes it to `execute`; the variables
  never contain the token. **Validates: Requirements 2**
- Property 6: two slots checking at once each get their own result (call `onSuccess` for slot 2 before slot 1).
  **Validates: Requirements 2, 3**
- Property 7: after `onMutate`, changing the NIK or name (or choosing another holder type) returns the slot to its local
  state, and a later `onSuccess` / `onError` for the old values changes nothing on screen (stale ignored).
  **Validates: Requirements 3**
- Property 8: removing a ticket drops its run and touched flag: re-adding it gives an untouched, idle field even with the
  old values typed back. **Validates: Requirements 3**
- Property 9: `recheck` on rows 11–13 calls `mutate` again with the current values; `recheck` on any other state does
  nothing; `canRecheck` is false while checking. **Validates: Requirements 4**
- Property 10: `admission-invalid` calls `router.replace('/queue?event=evt_x')` once (twice `onSuccess` → once), with no
  `trackEvent` and no field message. **Validates: Requirements 5**
- Property 11: `trackEvent('order_nik_checked', { outcome })` is called once per settled non-admission result and never
  in `onError`; across all tests, no `trackEvent` / `reportError` argument contains a test NIK, name or token.
  **Validates: Requirements 6**
- Property 12: `allHoldersVerified` is false with no holders, false while any slot is not `valid`, true when all are, and
  false again after one value changes. **Validates: Requirements 6**
- Property 13: a language rerender retranslates every message without calling `mutate`; all FR-11–FR-14 controller tests
  still pass. **Validates: Requirements 4, 7**

## Error Handling

`validateAttendee` (through spec 54):

| Status / code                                                                            | Outcome             | User sees (under the NIK field)                                                                             |
| ---------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------- |
| no token, 403 `ADMISSION_INVALID`                                                        | `admission-invalid` | `router.replace('/queue?event=<id>')`                                                                       |
| 422 `NIK_INVALID`, `VALIDATION_FAILED`                                                   | `nik-invalid`       | "Nama dan NIK tidak cocok dengan data Dukcapil."                                                            |
| 409 `NIK_SEAT_TAKEN`                                                                     | `seat-taken`        | "NIK ini sudah punya tiket untuk event ini. Gunakan NIK pemegang lain."                                     |
| 409 `DUPLICATE_NIK`                                                                      | `duplicate`         | "NIK ini sudah dipakai di tiket lain dalam pesanan ini."                                                    |
| 429 `RATE_LIMITED`, `TOO_MANY_REQUESTS`                                                  | `rate-limited`      | "Terlalu banyak percobaan untuk tiket ini. Coba lagi dalam 60 detik." (or "sebentar lagi") + "Periksa lagi" |
| 503 `DUKCAPIL_UNAVAILABLE`, 5xx, `NETWORK_ERROR`, `TIMEOUT` (after the use case's retry) | `unavailable`       | "Dukcapil sedang sibuk. Coba periksa lagi." + "Periksa lagi"                                                |
| 401 `UNAUTHORIZED`, `UNKNOWN_ERROR`, other (rethrown)                                    | `onError`           | `t(ERROR_CODE_MAP[code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR)` + "Periksa lagi"                                  |

Local (no API): `incomplete`, `invalid-structure`, `duplicate` per the field-state table. Every code has an
`ERROR_CODE_MAP` entry already. Existing page errors (`getEvent`, `getCategories`, `getMe`) are unchanged. Not handled
here: `createBooking` codes (`ATTENDEE_NOT_VALIDATED`, `NIK_SEAT_TAKEN` at hold, `ACCOUNT_HAS_ACTIVE_BOOKING`).

## Testing Strategy

`src/controllers/__tests__/order.controller.test.ts`, new `describe('NIK checks')`:

- Deps: real `ValidateAttendeeUseCase({ bookingService: fake })` for `checkNik` (pure), with `execute` replaced by
  `vi.fn()` where the test drives results; `useMutationTanstack` mocked to capture the options and return `{ mutate }`
  (`mutate: vi.fn()`); tests call `options.onMutate(v)`, `options.mutationFn(v)`, `options.onSuccess(result, v)`,
  `options.onError(error, v)` inside `act`.
- One `it` per field-state row (13 rows), Properties 2–13, and the Data Models example.
- `mutationFn` test: `admissionStore.get` returns `'adm-1'`; `execute` receives `{ eventId, admissionToken: 'adm-1',
fieldIndex, fullName, nik }`.
- Privacy: a spy over `analyticsAdapter.trackEvent` / `reportError` asserts no argument string contains the test NIK or
  name.
- Fixtures: add `allHoldersVerified: false` to the shell fake in `src/presentation/pages/Order/__tests__/index.test.tsx`;
  add `name.onBlur`, `nik.checking: false`, `nik.canRecheck: false`, `nik.recheck` to the holder fixture in
  `HolderList/__tests__/index.test.tsx` (behaviour tests for them are spec 56).
- Gate: `npx tsc --noEmit && npm run lint && npx vitest --run`; controller coverage ≥ 85%.
