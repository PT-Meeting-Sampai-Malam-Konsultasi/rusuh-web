# Design Document

## Overview

`LoginController` holds the step, the challenge and the code; three mutations (request code, verify, save profile)
and the Home events query for the event aside. The e-mail and profile forms use React Hook Form + Zod.

## Components and Interfaces

```ts
type LoginStep = 'email' | 'code' | 'profile';
type CodeState = 'idle' | 'wrong' | 'expired' | 'locked';

interface LoginControllerInterface {
  t: TFunction;
  step: LoginStep;
  event: LoginEventView | null; // poster aside / phone banner
  emailForm: { register; onSubmit; error: string; submitting: boolean };
  code: {
    email: string;
    value: string;
    onChange(value: string): void;
    state: CodeState;
    message: string; // translated; '' when idle
    resendIn: string | null; // "0:42" while waiting, null when resend is allowed
    validFor: string; // "9:12"
    onResend(): void;
    onChangeEmail(): void;
    submitting: boolean;
  };
  profileForm: { register; onSubmit; error: string; email: string; submitting: boolean; submitLabel: string };
  locale;
  setLocale;
  homeHref: string;
}
```

`submitLabel` follows `next`: "Lanjut ke antrian" for `/queue`, "Lanjut pesan tiket" for `/order`, otherwise
"Lanjut".

## Layer Constraints

- Controllers are factory functions with DI deps, not hooks; registered with `asFunction(Controller)` (no singleton).
- No `.then()/.catch()`, no `useEffect` + service call; one query/mutation per async operation.
- `toggleLoading()` in all three mutation paths; `useWatch`, never `watch()`.
- Countdowns from server-provided durations plus the time since the answer, never the device clock against a
  deadline alone.
- Error display: `ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR` → `t(key)`; field-level codes under the
  field.

## Correctness Properties

- Property 1: a 6-digit code is verified at most once per value. **Validates: Requirements 1**
- Property 2: `next` never sends the user off-site. **Validates: Requirements 3**

## Error Handling

| Outcome / code                 | Shown                                                       |
| ------------------------------ | ----------------------------------------------------------- |
| `invalid-email`                | Under the e-mail field: "Email tidak valid"                 |
| `rate-limited`                 | Under the e-mail field (or the resend line): wait n seconds |
| `wrong-code`                   | Red boxes: "Kode salah. Sisa n percobaan."                  |
| `expired`                      | "Kode kedaluwarsa" + "Kirim kode baru"                      |
| `locked`                       | "Terlalu banyak percobaan" + "Kirim kode baru"              |
| `VALIDATION_FAILED` on profile | Under the name field                                        |
| `NETWORK_ERROR`, others        | Error popup with the translated code                        |

## Testing Strategy

Mocked DI deps; captured mutation options (`mutationFn`, `onSuccess`, `onError`); every outcome, loading in all
paths, `next` sanitising, timers with fake time, analytics.
