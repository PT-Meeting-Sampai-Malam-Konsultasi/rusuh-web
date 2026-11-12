# Requirements Document

## Introduction

Screens for FR-22-W1 from the HiFi `tickets.html` (default, empty, signed-out) and `ticket.html`.

## Requirements

### Requirement 1: My tickets (`/tickets`)

- Hero "Tiket Saya.", the groups, `OrderCard` per order; past cards dimmed and stamped "Selesai"; empty and signed-out
  cards with their action; skeleton while loading; error with retry

### Requirement 2: E-ticket (`/tickets/detail?booking=…`)

- Hero (stamp, heading, lead, actions, order line), `CalendarMenu` (native `<details>`), `TicketStub` per ticket
  (poster end, details, perforation, QR, print-only KTP note), "Di pintu masuk" rules; print styles (tickets only, one per
  A4 sheet, stacked at any paper width); not-found / not-paid messages linking to My tickets; error with retry
- Route in `<Suspense>` with `TicketSkeleton` (the controller reads `?booking=`); `app/tickets/error.tsx` for the
  segment

### Requirement 3: Shared

- `QrCode`: one SVG path on white, `role="img"` with the ticket code as its name
- `Poster` sizes `tile` (My tickets) and `stub` (e-ticket)
- Header, footer, tab bar, mock badge and offline banner hide in print
