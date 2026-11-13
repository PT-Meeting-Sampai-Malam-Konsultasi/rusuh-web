// Payment page models (FR-20-W1). The web pays through core.booking (Apidog): enterPayment gives the Snap token,
// getBooking / checkPaymentStatus the status. The payment module's /payment/payments/* is the mobile hand-off page.
import type { Attendee, BookingStatus, PriceBreakdown } from '@core/entities/booking/booking.entity';

/** The latest attempt as Midtrans confirmed it. Only `bookingStatus: PAID` means paid. */
export type PaymentStatus =
  'none' | 'pending' | 'settled' | 'denied' | 'expired' | 'cancelled' | 'failed' | 'paid_after_expiry';

/** The live Snap attempt, from enterPayment (idempotent while PAYMENT_PENDING: the live token again). */
export interface SnapTransaction {
  /** For `window.snap.pay(token)`. Never logged, never in analytics. */
  snapToken: string;
  /** Snap page URL (system tab / WebView; unused on the web). */
  redirectUrl?: string | null;
  /** End of the payment window (paymentExpiresAt). */
  gatewayExpiresAt: string;
}

/** What the payment page shows: the booking (getBooking) plus its event (getEvent). */
export interface PaymentView {
  bookingId: string;
  /** The admission token is kept per event (enterPayment needs it). */
  eventId: string;
  orderCode: string;
  eventName?: string;
  eventStartsAt?: string;
  venueShort?: string;
  /** IANA zone of the venue ("Asia/Jakarta"): dates are shown in it. */
  timezone?: string;
  /** One line per ticket (category, masked NIK); the price comes from price.lines. */
  attendees: Attendee[];
  /** Where a refund notice goes if the payment arrives late (ADR-0009); the booking does not carry it. */
  customerEmail?: string;
  price: PriceBreakdown;
  /** The live attempt, or null before "Bayar" asks for it. */
  currentSnap?: SnapTransaction | null;
  /** Payment deadline (end of PAYMENT_PENDING). */
  expiresAt: string;
  serverNow: string;
}

/** Where the booking stands, as the payment steps read it (from a Booking, never a separate status API). */
export interface PaymentStatusResponse {
  bookingStatus: BookingStatus;
  /** Only paid_after_expiry is known from the booking (refundRequired); the rest comes from the Snap callback. */
  paymentStatus?: PaymentStatus;
  serverNow: string;
}
