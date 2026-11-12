# Requirements Document

## Introduction

`ticketsController` (`/tickets`) and `ticketDetailController` (`/tickets/detail?booking=…`) for FR-22-W1, following
the HiFi `tickets.html` and `ticket.html`.

## Requirements

### Requirement 1: My tickets

- States `loading`, `ready`, `empty`, `signed-out` (401: a sign-in card, not a redirect, as the HiFi shows), `error`
  with retry
- Groups "Akan datang" ("2 pesanan · 5 tiket") and "Sudah lewat" ("1 pesanan"), each only when it has orders
- Each card: poster, title, date line, ticket stubs (category, holder, no NIK), order code and total, day and month,
  "n hari lagi" (venue's calendar days, server time), link to the e-ticket

### Requirement 2: E-ticket

- Reads `?booking=`; none or 404 → `not-found`; unpaid → `not-paid`; 401 → `/login?next=<this page>` (replace)
- "Lunas · 12.07 WIB" (venue zone), "Sampai jumpa di <venueShort>!", the lead with the sign-in e-mail when known
  (`GET /me`, optional), order code · total · method
- One stub per ticket: "Tiket n/N", category colour, holder and masked NIK, gate · seating, doors open, QR and code
- "Simpan / cetak PDF": the print dialog (the API's PDF is NON-V1 on Apidog); print styles put only the tickets on
  paper, one per A4 sheet with its own 12 mm margin, each with its QR (60 mm) and the KTP reminder
- "Tambah ke kalender" (only with the event): a menu with Google Calendar and Outlook links (event, time, place and
  the KTP reminder; never the order code or names) and an `.ics` named after the order for Apple and the rest
- Analytics: `tickets`, `ticket_detail` page views; `ticket_pdf_printed`, `ticket_calendar_added` (`via`)
