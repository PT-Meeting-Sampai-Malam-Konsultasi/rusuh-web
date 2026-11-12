import type { Booking, GetCategoriesResponse, ListMyTicketsResponse } from '@core/entities/booking/booking.entity';
import type { HttpResponse } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

/** Admission-gated core calls carry the token from claimTurn in this header (NFR-07, ADR-0005). */
export const ADMISSION_TOKEN_HEADER = 'X-Admission-Token';

export interface BookingServiceInterface {
  /**
   * `GET /events/{eventId}/categories`: categories, prices, stock snapshot and the order countdown.
   * Needs a live admission token (403 ADMISSION_INVALID otherwise) and a session (401 UNAUTHORIZED).
   */
  getCategories: (eventId: string, admissionToken: string) => Promise<HttpResponse<GetCategoriesResponse>>;
  /** `GET /bookings/{bookingId}`: status, price, order code and, once paid, its tickets. 404 also for someone else's. */
  getBooking: (bookingId: string) => Promise<HttpResponse<Booking>>;
  /** `GET /tickets`: every ticket of the signed-in account, across bookings. */
  listMyTickets: () => Promise<HttpResponse<ListMyTicketsResponse>>;
  /**
   * `GET /bookings/{bookingId}/tickets.pdf`: all e-tickets as one PDF, the same as the e-mail. 409 BOOKING_NOT_PAID.
   * Not built in v1 (Apidog: NON-V1, LLD-02): the e-ticket page prints to PDF instead. Kept for when it ships.
   */
  downloadTickets: (bookingId: string) => Promise<HttpResponse<Blob>>;
}

export const BookingService = ({ coreHttp }: Pick<AwilixRegistry, 'coreHttp'>): BookingServiceInterface => ({
  getCategories: (eventId, admissionToken) =>
    coreHttp.get<GetCategoriesResponse>(`events/${encodeURIComponent(eventId)}/categories`, {
      headers: { [ADMISSION_TOKEN_HEADER]: admissionToken },
    }),
  getBooking: (bookingId) => coreHttp.get<Booking>(`bookings/${encodeURIComponent(bookingId)}`),
  listMyTickets: () => coreHttp.get<ListMyTicketsResponse>('tickets'),
  downloadTickets: (bookingId) =>
    coreHttp.get<Blob>(`bookings/${encodeURIComponent(bookingId)}/tickets.pdf`, {
      headers: { Accept: 'application/pdf' },
      responseType: 'blob',
    }),
});
