import type { PaymentStatusResponse, PaymentView, SnapTransaction } from '@core/entities/payment/payment.entity';
import type { HttpResponse } from '@core/protocols/http.protocol';
import { IDEMPOTENCY_KEY_HEADER } from '@core/services/booking.service';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

/** `payment/payments/{bookingId}` on the core host (ADR-0028 prefix); the id is encoded so it never changes the path. */
const paymentPath = (bookingId: string) => `payment/payments/${encodeURIComponent(bookingId)}`;

export interface PaymentServiceInterface {
  /** `GET /payment/payments/{bookingId}`: order, attendees, breakdown, live Snap attempt, deadline. 401; 404; 409 BOOKING_NOT_HELD. */
  getPaymentPage: (bookingId: string) => Promise<HttpResponse<PaymentView>>;
  /**
   * `POST /payment/payments/{bookingId}/snap`, no body: the customer picks the method on the Snap page (H-3). The same key
   * returns the same attempt for 24 h; a new key creates attempt n + 1 (old token not revoked, LLD-03 §4.4).
   * 409 BOOKING_NOT_HELD; 503 PAYMENT_PROVIDER_BUSY (retryable).
   */
  startSnap: (bookingId: string, idempotencyKey: string) => Promise<HttpResponse<SnapTransaction>>;
  /** `GET /payment/payments/{bookingId}/status`: poll every 3–5 s. Only `bookingStatus: PAID` means paid. */
  getPaymentStatus: (bookingId: string) => Promise<HttpResponse<PaymentStatusResponse>>;
}

export const PaymentService = ({ coreHttp }: Pick<AwilixRegistry, 'coreHttp'>): PaymentServiceInterface => ({
  getPaymentPage: (bookingId) => coreHttp.get<PaymentView>(paymentPath(bookingId)),
  startSnap: (bookingId, idempotencyKey) =>
    coreHttp.post<SnapTransaction>(`${paymentPath(bookingId)}/snap`, undefined, {
      headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
    }),
  getPaymentStatus: (bookingId) => coreHttp.get<PaymentStatusResponse>(`${paymentPath(bookingId)}/status`),
});
