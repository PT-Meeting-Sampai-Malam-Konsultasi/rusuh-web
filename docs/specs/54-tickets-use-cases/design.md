# Design Document

```ts
interface MyOrder {
  booking: Booking;
  event: EventSummary | null;
  tickets: Ticket[];
}
interface MyOrdersResult {
  upcoming: MyOrder[];
  past: MyOrder[];
  serverNow: string | null;
}

type ETicketResult =
  | { kind: 'paid'; booking: Booking; event: EventSummary | null; tickets: Ticket[] }
  | { kind: 'not-paid'; status: BookingStatus; eventId: string }
  | { kind: 'not-found' };
```

## Layer Constraints

- Pure TypeScript; no React, Next.js, browser APIs, strings or navigation.
- Catch only the codes classified (`NOT_FOUND`); re-throw everything else.
- Stateless, `asFunction(UseCase).singleton()`, interface in `AwilixRegistry`.
