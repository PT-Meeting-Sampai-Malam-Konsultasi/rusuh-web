# Requirements Document

## Introduction

`LoginController` for `/login?next=<path>` (App Flow 4.3): e-mail → 6-digit code → in; a new account adds its name
(as on the KTP) once. NIK is not part of the account (ADR-0007, Apidog D17), so the HiFi's NIK field and presale
opt-in are left out.

## Requirements

### Requirement 1: Steps

#### Acceptance Criteria

- Steps: `email` → `code` → `profile` (new accounts only); the code step shows `wrong` (attempts left), `expired`
  and `locked` as states of the code field
- WHEN the e-mail is valid THEN SHALL request a code and go to `code`; "Ganti email" SHALL go back to `email`
- WHEN 6 digits are entered THEN SHALL verify once; editing the code after `wrong` SHALL clear the error
- WHEN signed in with an existing account THEN SHALL replace the route with `next`; a new account SHALL go to
  `profile`, prefilled with the name the API returned
- WHEN the profile is saved (`fullName` 1–200 characters, plus the UI locale) THEN SHALL replace the route with `next`

### Requirement 2: Timers

#### Acceptance Criteria

- Resend SHALL be offered after `resendAfterSeconds` counted from the answer; "Kirim ulang kode" requests a new code
  for the same e-mail
- The code validity line SHALL count down 10 minutes (ADR-0006) from the answer; the server's `CHALLENGE_EXPIRED`
  stays the authority

### Requirement 3: Return path and event

#### Acceptance Criteria

- `next` SHALL be used only when it is a same-site path (starts with one `/`); otherwise Home
- WHEN `next` names an event (`?event=<id>`) THEN SHALL show it as "Setelah masuk, Anda lanjut ke" and pass the
  event id to `requestOtp` (queue-token gate)

### Requirement 4: Errors and analytics

#### Acceptance Criteria

- `invalid-email` and `rate-limited` SHALL show under the e-mail field; network errors and other codes SHALL open the
  error popup with the translated code
- Loading SHALL be toggled in all three paths of every mutation
- SHALL track the page view `login` and `login_code_requested`, `login_verified` (`isNewAccount`),
  `login_profile_saved`
