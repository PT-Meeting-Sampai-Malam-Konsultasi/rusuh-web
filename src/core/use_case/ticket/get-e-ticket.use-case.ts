import type { Booking, BookingStatus, Ticket } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export type ETicketResult =
  | { kind: 'paid'; booking: Booking; event: EventSummary | null; tickets: Ticket[] }
  /** Held, expired or cancelled: no tickets to show. */
  | { kind: 'not-paid'; status: BookingStatus; eventId: string }
  /** Unknown id, or someone else's booking (the API answers 404 for both). */
  | { kind: 'not-found' };

export interface GetETicketUseCaseInterface {
  execute: (bookingId: string) => Promise<ETicketResult>;
}

type Deps = Pick<AwilixRegistry, 'bookingService' | 'catalogService'>;

const isNotFound = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as HttpError).code === 'NOT_FOUND';

/** The e-ticket page: the booking is the source of truth (paid or not, its tickets); the event adds name and place. */
export const GetETicketUseCase = ({ bookingService, catalogService }: Deps): GetETicketUseCaseInterface => ({
  execute: async (bookingId) => {
    let booking: Booking;
    try {
      booking = (await bookingService.getBooking(bookingId)).data;
    } catch (error) {
      if (isNotFound(error)) return { kind: 'not-found' };
      throw error;
    }
    if (booking.status !== 'PAID') return { kind: 'not-paid', status: booking.status, eventId: booking.eventId };

    let event: EventSummary | null = null;
    try {
      event = (await catalogService.getEvent(booking.eventId)).data;
    } catch (error) {
      // An event taken off the catalog: the tickets are what the buyer came for, show them without its name and place.
      if (!isNotFound(error)) throw error;
    }
    return { kind: 'paid', booking, event, tickets: booking.tickets ?? [] };
  },
});
