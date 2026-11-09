# Requirements Document

## Introduction

The `/login` screen (HiFi `login.html`: `email`, `otp`, `wrong`, `expired`, `profile`) and the mock API for it, so
every state can be seen without the backend. Copy follows ADR-0006 (10 minutes, 5 attempts), not the HiFi's 5
minutes and 3 tries.

## Requirements

### Requirement 1: Screen

#### Acceptance Criteria

- Route `src/app/login/page.tsx` SHALL wrap the screen in `<Suspense>`; `src/app/login/error.tsx` SHALL be the
  segment fallback
- E-mail step: heading "Masuk tanpa kata sandi.", lead, e-mail field with hint, "Kirim kode", terms line
- Code step: "Cek email Anda.", sent-to line with "Ganti email", six digit boxes (paste and one-time-code autofill
  fill all of them), "Masuk", resend line, spam/validity note; wrong/expired/locked shown on the field
- Profile step: "Akun baru dibuat" stamp, "Satu langkah lagi.", verified line, name field with hint, submit
- The event aside (poster on desktop, banner on phones) when `next` names an event; the three notes below

### Requirement 2: Accessibility

#### Acceptance Criteria

- One `h1` per step; field errors `role="alert"`; the code boxes form one labelled group with one input per digit
  and `autocomplete="one-time-code"` on the first
- Focus moves to the next box on input and to the previous box on Backspace

### Requirement 3: Mock API

#### Acceptance Criteria

- MSW handlers for `auth/otp`, `auth/otp/verify`, `auth/refresh`, `auth/logout`, `me` and `auth/profile`
- Code `123456` signs in; `000000` answers `CHALLENGE_EXPIRED`; other codes answer `WRONG_CODE` with the attempts
  left, and the fifth wrong code `CHALLENGE_LOCKED`; an e-mail containing `limit` answers `RATE_LIMITED`
- `nadia.saputri@gmail.com` is an existing account; other e-mails are new until their profile is saved
