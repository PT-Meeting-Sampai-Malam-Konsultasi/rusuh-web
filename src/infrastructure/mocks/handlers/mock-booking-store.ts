import type { Booking } from '@core/entities/booking/booking.entity';
import type { PaymentStatus } from '@core/entities/payment/payment.entity';

/** What a validation token stands for in the mock: never the full NIK. */
export interface MockAttendee {
  fullName: string;
  /** "3174 •••• •••• 0004" (first 4 + last 4, ADR-0024), as in Booking.attendees. */
  nikMasked: string;
}

/** One mocked Snap attempt (FR-20-W1). */
export interface MockSnapAttempt {
  attemptId: number;
  /** null for attempt 1, created by the FR-16 payment entry. */
  idempotencyKey: string | null;
  /** `mock-snap-<bookingId>-<attemptId>`. */
  snapToken: string;
  /** 'none' until its first status poll. */
  status: PaymentStatus;
  /** Server time (ms) of the first status poll of this attempt; it settles MOCK_SETTLE_MS later. */
  firstPolledAt: number | null;
}

export interface StoredBooking {
  booking: Booking;
  idempotencyKey: string;
  /** Set at the first successful payment entry; repeated entries answer the same one. */
  snapToken: string | null;
  /** Payment-entry calls so far (payment_busy fails only the first). */
  paymentEntries: number;
  /** Snap attempts, oldest first: attempt 1 from the payment entry, the next ones from startSnapPayment. */
  attempts: MockSnapAttempt[];
}

export interface MockBookingStore {
  rememberAttendee: (validationToken: string, attendee: MockAttendee) => void;
  attendee: (validationToken: string) => MockAttendee | undefined;
  byKey: (idempotencyKey: string) => StoredBooking | undefined;
  get: (bookingId: string) => StoredBooking | undefined;
  /** Adds or replaces by bookingId. */
  save: (entry: StoredBooking) => void;
  /** Live SELECTION / PAYMENT_PENDING entries for an event, after marking expired ones EXPIRED (at `now`). */
  active: (now: Date, eventId?: string) => StoredBooking[];
  /** Next order number: RSH-26-9xxxxx. */
  nextOrderCode: () => string;
}

const LIVE_STATUSES: ReadonlySet<Booking['status']> = new Set(['SELECTION', 'PAYMENT_PENDING']);

/** Marks a live booking whose deadline has passed EXPIRED (deadline cleared, as the contract says). */
export const expireIfDue = (entry: StoredBooking, now: Date): StoredBooking => {
  const { booking } = entry;
  if (!LIVE_STATUSES.has(booking.status)) return entry;
  if (booking.expiresAt && Date.parse(booking.expiresAt) > now.getTime()) return entry;
  entry.booking = { ...booking, status: 'EXPIRED', expiresAt: null };
  return entry;
};

/** Closure state per createHandlers call (like createMockQueueState): a page reload starts empty. */
export function createMockBookingStore(): MockBookingStore {
  const attendees = new Map<string, MockAttendee>();
  const bookings = new Map<string, StoredBooking>();
  let orders = 0;
  return {
    rememberAttendee: (validationToken, attendee) => attendees.set(validationToken, attendee),
    attendee: (validationToken) => attendees.get(validationToken),
    byKey: (idempotencyKey) => [...bookings.values()].find((entry) => entry.idempotencyKey === idempotencyKey),
    get: (bookingId) => bookings.get(bookingId),
    save: (entry) => bookings.set(entry.booking.bookingId, entry),
    active: (now, eventId) =>
      [...bookings.values()]
        .map((entry) => expireIfDue(entry, now))
        .filter(
          (entry) =>
            LIVE_STATUSES.has(entry.booking.status) && (eventId === undefined || entry.booking.eventId === eventId),
        ),
    nextOrderCode: () => {
      orders += 1;
      return `RSH-26-9${String(orders).padStart(5, '0')}`;
    },
  };
}
