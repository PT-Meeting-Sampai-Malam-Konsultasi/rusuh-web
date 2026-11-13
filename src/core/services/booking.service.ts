import type {
  ActiveBookingsResponse,
  Booking,
  CreateBookingRequest,
  EnterPaymentResponse,
  GetCategoriesResponse,
  ListMyTicketsResponse,
  ValidateAttendeeRequest,
  ValidateAttendeeResponse,
} from '@core/entities/booking/booking.entity';
import type { HttpResponse } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

/** Admission-gated core calls carry the token from claimTurn in this header (NFR-07, ADR-0005). */
export const ADMISSION_TOKEN_HEADER = 'X-Admission-Token';
/** createBooking: a client UUID; the same key returns the same booking for 24 h (openapi IdempotencyKey). */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

export interface BookingServiceInterface {
  /**
   * `GET /core/events/{eventId}/categories`: categories, prices, stock snapshot and the order countdown.
   * Needs a live admission token (403 ADMISSION_INVALID otherwise) and a session (401 UNAUTHORIZED).
   */
  getCategories: (eventId: string, admissionToken: string) => Promise<HttpResponse<GetCategoriesResponse>>;
  /** `GET /core/bookings/{bookingId}`: status, price, order code and, once paid, its tickets. 404 also for someone else's. */
  getBooking: (bookingId: string) => Promise<HttpResponse<Booking>>;
  /** `GET /core/tickets`: every ticket of the signed-in account, across bookings. */
  listMyTickets: () => Promise<HttpResponse<ListMyTicketsResponse>>;
  /**
   * `GET /core/bookings/{bookingId}/tickets.pdf`: all e-tickets as one PDF, the same as the e-mail. 409 BOOKING_NOT_PAID.
   * Not built in v1 (Apidog: NON-V1, LLD-02): the e-ticket page prints to PDF instead. Kept for when it ships.
   */
  downloadTickets: (bookingId: string) => Promise<HttpResponse<Blob>>;
  /**
   * `POST /core/events/{eventId}/attendees/validate`: one ticket holder's name + NIK against format, Dukcapil and the
   * one-seat-per-NIK rule (ADR-0007). Needs a live admission token (403 ADMISSION_INVALID) and a session.
   * 409 NIK_SEAT_TAKEN / DUPLICATE_NIK, 422 NIK_INVALID, 429 RATE_LIMITED (Retry-After), 503 DUKCAPIL_UNAVAILABLE.
   */
  validateAttendee: (
    eventId: string,
    admissionToken: string,
    body: ValidateAttendeeRequest,
  ) => Promise<HttpResponse<ValidateAttendeeResponse>>;
  /**
   * `POST /core/bookings`: a SELECTION booking (5 min, D5) from one validated attendee per ticket. No stock hold yet.
   * 403 ADMISSION_INVALID; 409 NIK_SEAT_TAKEN, DUPLICATE_NIK, ATTENDEE_NOT_VALIDATED, QUANTITY_OVER_RESERVATION,
   * ACCOUNT_HAS_ACTIVE_BOOKING, CATEGORY_SOLD_OUT (+ categoryId); 422 VALIDATION_FAILED.
   */
  createBooking: (
    admissionToken: string,
    idempotencyKey: string,
    body: CreateBookingRequest,
  ) => Promise<HttpResponse<Booking>>;
  /**
   * `POST /core/bookings/{bookingId}/payment`: the atomic stock + NIK hold, SELECTION → PAYMENT_PENDING (10 min), and the
   * first Snap token. Idempotent while PAYMENT_PENDING. 403; 404; 409 BOOKING_NOT_HELD, CATEGORY_SOLD_OUT (+ categoryId),
   * NIK_SEAT_TAKEN (+ nikMasked); 503 retryable.
   */
  enterPayment: (bookingId: string, admissionToken: string) => Promise<HttpResponse<EnterPaymentResponse>>;
  /**
   * `POST /core/bookings/{bookingId}/check-status`: re-checks the live attempt with Midtrans Get Status; settlement →
   * PAID, expire → EXPIRED, a Get Status 404 leaves it unchanged. Returns the booking. 403; 404.
   */
  checkPaymentStatus: (bookingId: string, admissionToken: string) => Promise<HttpResponse<Booking>>;
  /** `GET /core/bookings/active`: this account's SELECTION / PAYMENT_PENDING bookings, at most one per event. */
  getActiveBooking: () => Promise<HttpResponse<ActiveBookingsResponse>>;
}

export const BookingService = ({ coreHttp }: Pick<AwilixRegistry, 'coreHttp'>): BookingServiceInterface => ({
  getCategories: (eventId, admissionToken) =>
    coreHttp.get<GetCategoriesResponse>(`core/events/${encodeURIComponent(eventId)}/categories`, {
      headers: { [ADMISSION_TOKEN_HEADER]: admissionToken },
    }),
  getBooking: (bookingId) => coreHttp.get<Booking>(`core/bookings/${encodeURIComponent(bookingId)}`),
  listMyTickets: () => coreHttp.get<ListMyTicketsResponse>('core/tickets'),
  downloadTickets: (bookingId) =>
    coreHttp.get<Blob>(`core/bookings/${encodeURIComponent(bookingId)}/tickets.pdf`, {
      headers: { Accept: 'application/pdf' },
      responseType: 'blob',
    }),
  validateAttendee: (eventId, admissionToken, body) =>
    coreHttp.post<ValidateAttendeeResponse, ValidateAttendeeRequest>(
      `core/events/${encodeURIComponent(eventId)}/attendees/validate`,
      body,
      { headers: { [ADMISSION_TOKEN_HEADER]: admissionToken } },
    ),
  createBooking: (admissionToken, idempotencyKey, body) =>
    coreHttp.post<Booking, CreateBookingRequest>('core/bookings', body, {
      headers: { [ADMISSION_TOKEN_HEADER]: admissionToken, [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),
  enterPayment: (bookingId, admissionToken) =>
    coreHttp.post<EnterPaymentResponse>(`core/bookings/${encodeURIComponent(bookingId)}/payment`, undefined, {
      headers: { [ADMISSION_TOKEN_HEADER]: admissionToken },
    }),
  checkPaymentStatus: (bookingId, admissionToken) =>
    coreHttp.post<Booking>(`core/bookings/${encodeURIComponent(bookingId)}/check-status`, undefined, {
      headers: { [ADMISSION_TOKEN_HEADER]: admissionToken },
    }),
  getActiveBooking: () => coreHttp.get<ActiveBookingsResponse>('core/bookings/active'),
});
