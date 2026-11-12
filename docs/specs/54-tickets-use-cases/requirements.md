# Requirements Document

## Introduction

Use cases for FR-22-W1: `GET /tickets` lists tickets, not orders, and has no event or price, so My tickets needs
grouping and two more lookups; the e-ticket page branches on the booking status.

## Requirements

### Requirement 1: My orders (`getMyOrdersUseCase`)

- SHALL group tickets by booking, load each booking and each distinct event once (in parallel)
- SHALL keep only `PAID` bookings; an event the catalog no longer has (404) leaves `event: null`; any other error fails
  the whole list
- SHALL split upcoming (soonest first) from past (latest first); an event is past 12 hours after it starts; an order
  without its event sorts last among the upcoming
- SHALL return the bookings' latest `serverNow` for "n hari lagi", or null with no orders

### Requirement 2: E-ticket (`getETicketUseCase`)

- `paid` with booking, event and tickets; `not-paid` for any other status (no event call); `not-found` on 404
- An event 404 still shows the tickets; other errors pass through
