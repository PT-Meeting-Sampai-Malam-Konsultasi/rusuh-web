# Add entities

Types for one API aggregate, matching `../rusuh-documentation/api/openapi.yaml`.

## Steps

1. Find the operations and schemas the feature uses in `openapi.yaml`.
2. Create `src/core/entities/{domain}/{domain}.entity.ts` (or narrow the generated types if `openapi-typescript` is set
   up in `src/core/entities/generated/`).
3. Name requests after the action (`CreateBookingRequest`), responses after what they return (`Booking`,
   `QueuePlace`), enums as string unions (`type BookingStatus = 'HELD' | 'PAID' | 'EXPIRED' | 'CANCELLED'`).

## Rules

- Types only, no runtime code, zero imports except `import type` from other entities.
- Optional (`?`) only where the contract says so; nullable as `T | null` where the contract says `null`.
- Money: `{ amount: number; currency: 'IDR' }` as in the contract. Times: ISO strings.

## Template

```ts
// src/core/entities/booking/booking.entity.ts
export type BookingStatus = 'HELD' | 'PAID' | 'EXPIRED' | 'CANCELLED';

export interface Money { amount: number; currency: 'IDR' }

export interface AttendeeInput { fieldIndex: number; fullName: string; nik: string }

export interface CreateBookingRequest {
  eventId: string;
  lines: { categoryId: string; quantity: number }[];
  attendees: { categoryId: string; validationToken: string }[];
}

export interface Booking {
  bookingId: string;
  orderCode: string;
  status: BookingStatus;
  price: { ticketSubtotal: Money; adminFee: Money; total: Money };
  expiresAt: string | null;
  serverNow: string;
}
```
