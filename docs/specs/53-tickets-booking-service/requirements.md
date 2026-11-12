# Requirements Document

## Introduction

Entities, service calls and adapters for the e-ticket and My tickets (FR-22-W1, rusuh-web#21): `listMyTickets`,
`getBooking`, `downloadBookingTickets` from `api/openapi.yaml`.

## Requirements

### Requirement 1: Entities

- SHALL add `Booking`, `BookingStatus` (`HELD | PAID | EXPIRED | CANCELLED`), `PriceBreakdown`, `PriceLine`, `Ticket`,
  `PaymentMethod` and `ListMyTicketsResponse` as the contract names them

### Requirement 2: Service

- `getBooking(bookingId)` SHALL call `GET bookings/{id}` (id encoded)
- `listMyTickets()` SHALL call `GET tickets`
- `downloadTickets(bookingId)` SHALL call `GET bookings/{id}/tickets.pdf` with `Accept: application/pdf` and a blob
  response; a problem body sent back as a blob SHALL keep its `code` (`BOOKING_NOT_PAID`). Apidog marks this endpoint
  NON-V1 (LLD-02): kept for when it ships, not called in v1

### Requirement 3: Adapters

- `fileSaver.save(data, filename, type?)` SHALL download a Blob or a string through a temporary object URL, reading
  `document` only on save (static export prerender)
- `printer.print()` SHALL open the browser's print dialog ("Save as PDF")
- `qrEncoder.encode(text)` SHALL return the module matrix (level M, 4-module quiet zone), registered by the e-ticket
  page only so the QR library loads with that page

### Requirement 4: Mock API

- `GET /tickets`, `GET /bookings/:id`, `GET /bookings/:id/tickets.pdf` SHALL answer 401 without a bearer token; three
  paid HiFi orders (Samudra, Pelita, Kelana past) and `bk_mock_expired`; `?mock=empty` lists none; 404 for unknown ids;
  409 `BOOKING_NOT_PAID` for the PDF of an unpaid booking
