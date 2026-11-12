# Requirements Document

## Introduction

Follow the real backend at `https://api.rusuh-tiket.web.id/v1` (NFR-07-W5, rusuh-web#61): the core paths moved under
`/core` and device registration under `/queue` (Apidog refreshed 12 Nov 2026; checked against the live API the same
day). The web is either fully mocked (`NEXT_PUBLIC_API_MOCK=true`) or fully real; there is no per-area switch.

## Requirements

### Requirement 1: Paths

- Account SHALL read `GET /auth/profile` (`/me` is not served)
- Core calls SHALL use `/core/…`: `core/events`, `core/events/{id}`, `core/events/{id}/categories`,
  `core/events/{id}/attendees/validate`, `core/bookings/{id}`, `core/bookings/{id}/tickets.pdf`, `core/tickets`
- Device registration SHALL use `POST /queue/devices`
- The mock API SHALL serve the same paths, so mock and real stay one contract
