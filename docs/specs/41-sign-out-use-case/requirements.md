# Requirements Document

## Introduction

Sign out for NFR-07-W3 (rusuh-web#32): revoke the session on the server (`POST /auth/logout`, clears the `__Host-rt`
cookie) and forget the access token in memory, even when the call fails, so the device is signed out either way.

## Requirements

### Requirement 1

#### Acceptance Criteria

- `signOutUseCase.execute` SHALL call `authService.logout`, then clear the access token
- WHEN the call fails THEN SHALL still clear the token and answer `{ revoked: false }` (never throw)
