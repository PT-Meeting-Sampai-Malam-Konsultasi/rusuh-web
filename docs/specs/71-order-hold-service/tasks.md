# Implementation Plan: Order hold service

## Overview

Add the v1 booking types (`SELECTION`, `PAYMENT_PENDING`, `Attendee`, create / payment-entry / active-bookings shapes),
`bookingService.createBooking` (admission + `Idempotency-Key`), `enterPayment` and `getActiveBooking`, move the UUID v4
generator to `src/utils/random-uuid.ts`, and give the MSW mock an in-memory booking store with create, payment-entry and
active-bookings handlers plus the `nik_seat_taken`, `category_sold_out` and `payment_busy` scenarios. No new DI key.
Writer: service-writer. Spec 72 consumes it; FR-20-W1 reads the same mock bookings through `getBooking`.

## Tasks

- [x] 1. In `src/core/entities/booking/booking.entity.ts`: widen `BookingStatus` (keep `HELD`), add `Attendee`, `CreateBookingTicket`, `CreateBookingRequest`, `EnterPaymentResponse`, `ActiveBookingsResponse`, and `attendees?`, `expiresAt?`, `refundRequired?` on `Booking`, with the design's TSDoc; types only [Requirement 1]
- [x] 2. Add `IDEMPOTENCY_KEY_HEADER`, `createBooking`, `enterPayment` and `getActiveBooking` to `src/core/services/booking.service.ts` per the design, and their cases (Properties 1–4) in `src/core/services/__tests__/booking.service.test.ts` [Requirement 2, Requirement 3, Requirement 6]
- [x] 3. Move `randomRequestId` to `src/utils/random-uuid.ts` as `randomUuid` (same body), import it in `src/infrastructure/adapters/http.adapter.ts` and keep `export const randomRequestId = randomUuid`; add `src/utils/__tests__/random-uuid.test.ts` (both branches) [Requirement 4]
- [x] 4. Add `src/infrastructure/mocks/handlers/mock-booking-store.ts` (`createMockBookingStore`, closure state), `bookingStore` on `MockHandlerContext` in `shared.ts`, and create it next to `queueState` in `handlers.ts`; add the three scenarios with comments to `src/infrastructure/mocks/scenario.ts` [Requirement 5]
- [x] 5. In `src/infrastructure/mocks/handlers/booking.handlers.ts`: export `MOCK_ADMIN_FEE` (used by categories too), remember attendees on a 200 validate, add `GET core/bookings/active` before `GET core/bookings/:bookingId`, make `getBooking` read the store first, and add `POST core/bookings` and `POST core/bookings/:bookingId/payment` in the design's row order [Requirement 5]
- [x] 6. Tests: every row of both handler tables, fee once per order for 1–3 tickets, idempotent replay, active-booking listing and expiry, PAYMENT_PENDING repeat, `payment_busy` first-then-ok, `getBooking` after entry, no full NIK in any body (`booking.handlers.test.ts`); the three scenarios in `scenario.test.ts` [Requirement 5, Requirement 6]
- [x] 7. Run the gate check [ALL]

## Task Dependency Graph

```json
{ "waves": [[1, 3], [2, 4], [5], [6], [7]] }
```

## Notes

- Gate: `npm run typecheck && npm run lint && npx vitest --run`; coverage ≥ 85% on the changed files.
- MSW matches in registration order: `GET /core/bookings/active` must come before `GET /core/bookings/:bookingId` or
  `active` is read as a booking id (test it).
- The service takes the admission token and the idempotency key as parameters; only the controller reads
  `admissionStore` and makes the key (spec 73); only the use case decides what a missing token means (spec 72).
- The store lives per `createHandlers` call, so a page reload (new MSW worker handlers) starts with no bookings. That is
  the only way to clear a stuck SELECTION booking in the mock before its 5 minutes pass.
- The validate handler stores the attendee's name and masked NIK in memory only (mock), never the full NIK.
- `snapToken` is answered by the mock but not stored by the client in this ticket (FR-20-W1 calls `enterPayment` again).
- Commit: `feat(order): [FR-16-W1] add the create booking and payment entry calls and mocks`.
