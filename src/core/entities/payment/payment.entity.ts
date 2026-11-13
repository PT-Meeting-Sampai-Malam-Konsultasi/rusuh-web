// Payment module types, matching rusuh-documentation/api/openapi.yaml (PaymentView, SnapTransaction, PaymentStatus).
import type { Attendee, BookingStatus, PaymentMethod, PriceBreakdown } from '@core/entities/booking/booking.entity';

/** The latest attempt as Midtrans confirmed it. Only `bookingStatus: PAID` means paid. */
export type PaymentStatus =
  'none' | 'pending' | 'settled' | 'denied' | 'expired' | 'cancelled' | 'failed' | 'paid_after_expiry';

/** One Midtrans attempt (`order_id = {bookingId}-{attempt}`, ADR-0008). */
export interface SnapTransaction {
  attemptId: number;
  orderId: string;
  /** The method this attempt was opened on; null when the customer picks on Snap (always, on the web). */
  method?: PaymentMethod | null;
  /** For `window.snap.pay(token)`. Never logged, never in analytics. */
  snapToken: string;
  /** Snap page URL (system tab / WebView; unused on the web). */
  redirectUrl: string;
  /** Midtrans expiry: 10 minutes from the payment entry (P + 10, LLD-03 §4). */
  gatewayExpiresAt: string;
}

/** getPaymentPage 200. */
export interface PaymentView {
  bookingId: string;
  orderCode: string;
  eventName?: string;
  eventStartsAt?: string;
  venueShort?: string;
  /** IANA zone of the venue ("Asia/Jakarta"): dates are shown in it. */
  timezone?: string;
  /** One line per ticket (category, masked NIK); the price comes from price.lines. */
  attendees: Attendee[];
  /** Where a refund notice goes if the payment arrives late (ADR-0009). */
  customerEmail?: string;
  price: PriceBreakdown;
  /** The live attempt, or null before the first one. */
  currentSnap?: SnapTransaction | null;
  /** Payment deadline (end of PAYMENT_PENDING). For FR-21-W1; not shown in this ticket. */
  expiresAt: string;
  serverNow: string;
  /** paySession (mobile) only: the web authenticates with bearer and ignores it. */
  csrfToken: string;
  /** Public Midtrans client key; the web loads snap.js with config.midtransClientKey. */
  snapClientKey: string;
}

/** startSnapPayment body. The web sends none: the customer picks on Snap (H-3). Kept for the contract. */
export interface StartSnapPaymentRequest {
  method?: PaymentMethod;
}

/** getPaymentStatus 200. */
export interface PaymentStatusResponse {
  bookingStatus: BookingStatus;
  paymentStatus?: PaymentStatus;
  /** Mobile App Link, set when final; unused on the web. */
  returnUrl?: string;
  serverNow: string;
}
