# Requirements Document

## Introduction

`accountController` for `/account` (NFR-07-W3, rusuh-web#32): who you are and how you sign in. Scope agreed on
10 Nov: the name (view and edit), the sign-in e-mail (shown, no change flow), sign out. No NIK on the account
(ADR-0007, D17), no presale opt-in, no delete (no API).

## Requirements

### Requirement 1: Load

- SHALL read `GET /me`; states `loading`, `ready`, `error` (with retry)
- WHEN it answers 401 (no session, or the refresh failed) THEN SHALL go to `/login?next=/account` (replace)

### Requirement 2: Name

- "Ubah" SHALL open the form with the current name; "Batal" closes it
- "Simpan" SHALL validate (1–200 characters after trimming), save with `PUT /auth/profile` (`fullName`, current
  `locale`), update the shown name and close the form; `VALIDATION_FAILED` shows under the field; other errors in the
  popup; the loading overlay in all three mutation paths

### Requirement 3: Sign out

- "Keluar" SHALL sign out (`signOutUseCase`), drop the cached profile, track `account_sign_out`, and go Home (replace)
