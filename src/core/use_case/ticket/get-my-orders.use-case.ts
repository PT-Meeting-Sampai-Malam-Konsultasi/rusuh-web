import type { Booking, Ticket } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

/** One paid order on "Tiket Saya": the booking (order code, total), its event and its tickets. */
export interface MyOrder {
  booking: Booking;
  /** Null when the catalog no longer has the event (404): the order still shows, with what the tickets say. */
  event: EventSummary | null;
  tickets: Ticket[];
}

export interface MyOrdersResult {
  /** Soonest first: the next event is what matters. */
  upcoming: MyOrder[];
  /** Latest first. */
  past: MyOrder[];
  /** Server clock from the bookings, for "25 hari lagi"; null when there are no orders. */
  serverNow: string | null;
}

export interface GetMyOrdersUseCaseInterface {
  execute: () => Promise<MyOrdersResult>;
}

/** A concert night: an event counts as past 12 hours after it starts, not the minute the doors open. */
export const PAST_AFTER_MS = 12 * 3_600_000;

type Deps = Pick<AwilixRegistry, 'bookingService' | 'catalogService'>;

/**
 * `GET /tickets` lists tickets, not orders: group them by booking, then load each booking (order code, total) and
 * each event once. A user has a handful of orders, so the extra calls stay small.
 */
export const GetMyOrdersUseCase = ({ bookingService, catalogService }: Deps): GetMyOrdersUseCaseInterface => ({
  execute: async () => {
    const { data } = await bookingService.listMyTickets();
    const byBooking = new Map<string, Ticket[]>();
    for (const ticket of data.items) {
      byBooking.set(ticket.bookingId, [...(byBooking.get(ticket.bookingId) ?? []), ticket]);
    }
    if (byBooking.size === 0) return { upcoming: [], past: [], serverNow: null };

    const bookings = await Promise.all(
      [...byBooking.keys()].map(async (id) => (await bookingService.getBooking(id)).data),
    );
    const eventIds = [...new Set(bookings.map((b) => b.eventId))];
    const events = new Map(
      await Promise.all(
        eventIds.map(async (id) => {
          try {
            return [id, (await catalogService.getEvent(id)).data] as const;
          } catch (error) {
            // An event taken off the catalog: the order still shows, with what the tickets say.
            if ((error as HttpError | null)?.code === 'NOT_FOUND') return [id, null] as const;
            throw error;
          }
        }),
      ),
    );

    const serverNow =
      bookings
        .map((b) => b.serverNow)
        .sort()
        .at(-1) ?? null;
    const now = serverNow ? Date.parse(serverNow) : 0;
    const orders: MyOrder[] = bookings
      .filter((booking) => booking.status === 'PAID')
      .map((booking) => ({
        booking,
        event: events.get(booking.eventId) ?? null,
        tickets: byBooking.get(booking.bookingId) ?? [],
      }));
    const startOf = (order: MyOrder) => (order.event ? Date.parse(order.event.startsAt) : Number.POSITIVE_INFINITY);
    const isPast = (order: MyOrder) => startOf(order) + PAST_AFTER_MS < now;

    return {
      upcoming: orders.filter((o) => !isPast(o)).sort((a, b) => startOf(a) - startOf(b)),
      past: orders.filter(isPast).sort((a, b) => startOf(b) - startOf(a)),
      serverNow,
    };
  },
});
