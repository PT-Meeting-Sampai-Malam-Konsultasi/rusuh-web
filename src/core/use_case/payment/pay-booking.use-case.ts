import type { Booking, BookingStatus } from '@core/entities/booking/booking.entity';
import type {
  PaymentStatus,
  PaymentStatusResponse,
  PaymentView,
  SnapTransaction,
} from '@core/entities/payment/payment.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { SnapPayResult } from '@core/protocols/snap.protocol';
import { errorCodeOf } from '@core/use_case/device/with-device-token';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

/** How the last Snap popup ended, when it started a poll ('closed' does not poll). */
export type SnapHint = 'success' | 'pending' | 'error';

/** One summary line per ticket (category, masked NIK, unit price). No name. */
export interface PaymentTicketLine {
  categoryId: string;
  categoryName: string;
  /** "3174 •••• •••• 0004". */
  nikMasked: string;
  /** Whole rupiah from price.lines; null when the category has no line. */
  unitPrice: number | null;
}

/** Why the order can no longer be paid. expired: the 10 minutes ran out (late payments included). other: anything else. */
export type InactiveReason = 'expired' | 'other';

/** The booking is dead (409 BOOKING_NOT_HELD or a dead status). eventId / ticketCount are null when getBooking failed. */
export interface InactiveOutcome {
  kind: 'inactive';
  /** A payment arrived after expiry (ADR-0009): paid_after_expiry or booking.refundRequired. */
  refund: boolean;
  reason: InactiveReason;
  eventId: string | null;
  /** Tickets the booking held; null when unknown or 0. */
  ticketCount: number | null;
}

export type PaymentPageResult =
  | { kind: 'ready'; view: PaymentView; tickets: PaymentTicketLine[] }
  /** 409 and the status says PAID: go to the e-ticket. */
  | { kind: 'paid' }
  /** 409 and expired / cancelled. */
  | InactiveOutcome
  /** Empty id, 404 (unknown or someone else's booking). */
  | { kind: 'not-found' }
  | { kind: 'unauthorized' };

export interface PayInput {
  bookingId: string;
  /** The controller's attempt key (a UUID); a new one only after a failed attempt. */
  idempotencyKey: string;
  /** A transaction to reopen (the view's currentSnap or the one opened last); null to start one. */
  reusable: SnapTransaction | null;
}

export type PayResult =
  /** Snap was shown and ended this way: a hint, never a confirmation. */
  | { kind: 'snap'; outcome: SnapPayResult['kind']; snap: SnapTransaction }
  | { kind: 'paid' }
  | InactiveOutcome
  | { kind: 'not-found' }
  | { kind: 'unauthorized' }
  /** Busy / transport / Snap would not open. snap: reopen it on the retry (null: start again, same key). */
  | { kind: 'retryable'; code: string; requestId?: string; snap: SnapTransaction | null };

export type PaymentStep =
  | { kind: 'paid' }
  /** confirming: money sent, waiting for Midtrans / core. waiting: a VA / QRIS that is not paid yet. */
  | { kind: 'verifying'; reason: 'confirming' | 'waiting' }
  /** The attempt failed; the booking is still PAYMENT_PENDING, so the buyer can pay again (new attempt). */
  | { kind: 'failed'; paymentStatus: PaymentStatus }
  | InactiveOutcome;

export interface PayBookingUseCaseInterface {
  /** ready: 1 call. 409: + getPaymentStatus; dead: + getBooking (3 at most). */
  load: (bookingId: string) => Promise<PaymentPageResult>;
  /** At most: startSnap, snap.pay; or on 409 startSnap, getPaymentStatus, getBooking (dead only). Never retried here. */
  pay: (input: PayInput) => Promise<PayResult>;
  /** 1 call; + getBooking only when the step is inactive. A 401 from either call is thrown. */
  checkStatus: (bookingId: string, hint: SnapHint) => Promise<PaymentStep>;
}

const TRANSIENT_CODES = new Set([
  'INTERNAL_ERROR',
  'PAYMENT_PROVIDER_BUSY',
  'SERVICE_UNAVAILABLE',
  'NETWORK_ERROR',
  'TIMEOUT',
]);
const FAILED: ReadonlySet<PaymentStatus> = new Set<PaymentStatus>(['denied', 'failed', 'cancelled', 'expired']);
const DEAD: ReadonlySet<string> = new Set(['EXPIRED', 'CANCELLED', 'SELECTION']);
/** Still marked live, but past the deadline on the server clock: the sweeper has not run yet (ADR-0026). */
const EXPIRED_BY_TIME: ReadonlySet<BookingStatus> = new Set<BookingStatus>(['PAYMENT_PENDING', 'HELD']);

const statusOf = (error: unknown): number => (error as HttpError | null)?.status ?? 0;
const isTransient = (error: unknown): boolean =>
  TRANSIENT_CODES.has(errorCodeOf(error) ?? '') || statusOf(error) >= 500;
const isUnauthorized = (error: unknown): boolean => errorCodeOf(error) === 'UNAUTHORIZED' || statusOf(error) === 401;
const isNotFound = (error: unknown): boolean => errorCodeOf(error) === 'NOT_FOUND' || statusOf(error) === 404;
const isNotHeld = (error: unknown): boolean => errorCodeOf(error) === 'BOOKING_NOT_HELD';
const requestIdOf = (error: unknown): string | undefined => {
  const requestId = (error as HttpError | null)?.requestId;
  return typeof requestId === 'string' ? requestId : undefined;
};

/** Marks a dead step; checkStatus turns it into an InactiveOutcome with one getBooking. */
type LiveStep = Exclude<PaymentStep, InactiveOutcome> | { kind: 'ended' };

/** Requirement 4, first match. HELD (pre-v1) falls through like PAYMENT_PENDING. */
const stepOf = (status: PaymentStatusResponse, hint: SnapHint): LiveStep => {
  const { bookingStatus, paymentStatus } = status;
  if (bookingStatus === 'PAID') return { kind: 'paid' };
  if (paymentStatus === 'paid_after_expiry') return { kind: 'ended' };
  if (DEAD.has(bookingStatus)) return { kind: 'ended' };
  if (paymentStatus && FAILED.has(paymentStatus)) return { kind: 'failed', paymentStatus };
  if (paymentStatus === 'settled') return { kind: 'verifying', reason: 'confirming' };
  if (paymentStatus !== 'pending' && hint === 'error') return { kind: 'failed', paymentStatus: 'none' };
  return { kind: 'verifying', reason: hint === 'pending' ? 'waiting' : 'confirming' };
};

/** Attendees in order with the unit price of their category's line. fullName is not copied. */
const ticketLines = (view: PaymentView): PaymentTicketLine[] =>
  view.attendees.map(({ categoryId, categoryName, nikMasked }) => {
    const line = view.price.lines.find((l) => l.categoryId === categoryId);
    return { categoryId, categoryName, nikMasked, unitPrice: line ? line.unitPrice.amount : null };
  });

/** Past its own deadline, compared with the booking's serverNow only (ADR-0005), never the device clock. */
const pastDeadline = (booking: Booking): boolean => {
  if (!EXPIRED_BY_TIME.has(booking.status) || !booking.expiresAt) return false;
  const deadline = Date.parse(booking.expiresAt);
  const now = Date.parse(booking.serverNow);
  return Number.isFinite(deadline) && Number.isFinite(now) && deadline <= now;
};

/** attendees.length, else the sum of the price lines; null when 0. */
const ticketCountOf = (booking: Booking): number | null => {
  const fromAttendees = booking.attendees?.length ?? 0;
  if (fromAttendees > 0) return fromAttendees;
  const fromLines = (booking.price?.lines ?? []).reduce((sum, line) => sum + (line.quantity || 0), 0);
  return fromLines > 0 ? fromLines : null;
};

/** FR-23-W1: why the order ended, from the Status and (when the read worked) the Booking. */
const classify = (status: PaymentStatusResponse, booking: Booking | null): InactiveOutcome => {
  const refund = status.paymentStatus === 'paid_after_expiry' || booking?.refundRequired === true;
  const expired =
    refund ||
    status.bookingStatus === 'EXPIRED' ||
    booking?.status === 'EXPIRED' ||
    (booking !== null && pastDeadline(booking));
  return {
    kind: 'inactive',
    refund,
    reason: expired ? 'expired' : 'other',
    eventId: booking?.eventId ?? null,
    ticketCount: booking ? ticketCountOf(booking) : null,
  };
};

/** FR-20-W1: load the payment page, open Snap (reuse or start an attempt), map status polls to the next step. */
export const PayBookingUseCase = ({
  paymentService,
  bookingService,
  snap,
}: Pick<AwilixRegistry, 'paymentService' | 'bookingService' | 'snap'>): PayBookingUseCaseInterface => {
  /**
   * The single exit of every inactive path: one getBooking, never retried. The read only enriches an outcome already
   * decided from the Status, so any failure but 401 degrades to nulls (spec 81, recorded rule tension).
   */
  const endedOutcome = async (bookingId: string, status: PaymentStatusResponse): Promise<InactiveOutcome> => {
    let booking: Booking | null;
    try {
      booking = (await bookingService.getBooking(bookingId)).data;
    } catch (error) {
      if (isUnauthorized(error)) throw error;
      booking = null;
    }
    return classify(status, booking);
  };

  /** After a 409 BOOKING_NOT_HELD: one status call tells paid from a dead order. */
  const settle = async (bookingId: string): Promise<{ kind: 'paid' } | InactiveOutcome | { kind: 'unauthorized' }> => {
    try {
      const { data } = await paymentService.getPaymentStatus(bookingId);
      if (data.bookingStatus === 'PAID') return { kind: 'paid' };
      return await endedOutcome(bookingId, data);
    } catch (error) {
      if (isUnauthorized(error)) return { kind: 'unauthorized' };
      throw error;
    }
  };

  return {
    load: async (bookingId) => {
      if (!bookingId) return { kind: 'not-found' };
      try {
        const { data } = await paymentService.getPaymentPage(bookingId);
        return { kind: 'ready', view: data, tickets: ticketLines(data) };
      } catch (error) {
        if (isNotHeld(error)) return settle(bookingId);
        if (isNotFound(error)) return { kind: 'not-found' };
        if (isUnauthorized(error)) return { kind: 'unauthorized' };
        throw error;
      }
    },

    pay: async ({ bookingId, idempotencyKey, reusable }) => {
      if (!bookingId) return { kind: 'not-found' };
      let tx: SnapTransaction;
      if (reusable) {
        tx = reusable;
      } else {
        try {
          tx = (await paymentService.startSnap(bookingId, idempotencyKey)).data;
        } catch (error) {
          if (isNotHeld(error)) return settle(bookingId);
          if (isNotFound(error)) return { kind: 'not-found' };
          if (isUnauthorized(error)) return { kind: 'unauthorized' };
          if (isTransient(error)) {
            const code = errorCodeOf(error) ?? 'UNKNOWN_ERROR';
            const requestId = requestIdOf(error);
            return requestId === undefined
              ? { kind: 'retryable', code, snap: null }
              : { kind: 'retryable', code, requestId, snap: null };
          }
          throw error;
        }
      }
      try {
        const result = await snap.pay(tx.snapToken);
        return { kind: 'snap', outcome: result.kind, snap: tx };
      } catch (error) {
        if (errorCodeOf(error) === 'SNAP_UNAVAILABLE') return { kind: 'retryable', code: 'SNAP_UNAVAILABLE', snap: tx };
        throw error;
      }
    },

    checkStatus: async (bookingId, hint) => {
      const { data } = await paymentService.getPaymentStatus(bookingId);
      const step = stepOf(data, hint);
      return step.kind === 'ended' ? endedOutcome(bookingId, data) : step;
    },
  };
};
