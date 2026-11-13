import type { Booking, Category } from '@core/entities/booking/booking.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { TicketQuantities } from '@core/use_case/booking/order-ticket-selection.use-case';
import { errorCodeOf } from '@core/use_case/device/with-device-token';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

/** One ticket of the order, in slot order. */
export interface HoldTicket {
  categoryId: string;
  /** From the slot's valid NIK check (spec 55); '' when the slot has none. Never logged. */
  validationToken: string;
  /** Last 4 NIK digits, only to match a problem's nikMasked to the slot. Never sent, never logged. */
  nikLast4: string;
}

export interface HoldBookingInput {
  eventId: string;
  /** From the admission store at tap time; null when the tab has no live turn. */
  admissionToken: string | null;
  /** One UUID per attempt (spec 73); the same on a retry of the same selection. */
  idempotencyKey: string;
  /** Slot order: the body's tickets follow it. */
  tickets: readonly HoldTicket[];
  /** A booking this attempt already created (a retryable payment-entry failure); null to create one. */
  bookingId: string | null;
}

export type HoldConflictCode = 'NIK_SEAT_TAKEN' | 'DUPLICATE_NIK';
export type ActiveBookingStatus = 'SELECTION' | 'PAYMENT_PENDING';

export type HoldBookingResult =
  /** PAYMENT_PENDING: stock held for 10 minutes; go to the payment page. resumed: an existing booking was continued. */
  | { kind: 'held'; bookingId: string; resumed: boolean }
  /** No tickets, or a ticket without a validation token: nothing was sent. */
  | { kind: 'not-verified' }
  /** 409 NIK_SEAT_TAKEN / DUPLICATE_NIK. slotIndexes: matched by nikMasked; [] when unknown (recheck every holder). */
  | { kind: 'nik-conflict'; code: HoldConflictCode; slotIndexes: number[]; bookingId: string | null }
  /** 409 ATTENDEE_NOT_VALIDATED: a validation token expired or was refused: recheck every holder. */
  | { kind: 'attendees-stale' }
  /** 409 CATEGORY_SOLD_OUT (create or payment entry). */
  | { kind: 'sold-out'; categoryId: string | null; bookingId: string | null }
  /** 409 QUANTITY_OVER_RESERVATION: more tickets than this admission's reservation. */
  | { kind: 'over-reservation'; categoryId: string | null }
  /** 409 ACCOUNT_HAS_ACTIVE_BOOKING and the active booking is not this order (or is gone). */
  | { kind: 'active-booking'; bookingId: string | null; status: ActiveBookingStatus | null }
  /** 409 BOOKING_NOT_HELD / 404 at payment entry: the booking expired, was paid or cancelled. Start a new attempt. */
  | { kind: 'not-held' }
  /** No token, or 403 ADMISSION_INVALID. */
  | { kind: 'admission-invalid' }
  /** 401 after the adapter's refresh. */
  | { kind: 'unauthorized' }
  /** 5xx / busy / network / timeout. bookingId: pass it back on the retry (null: repeat the create, same key). */
  | { kind: 'retryable'; code: string; bookingId: string | null; requestId?: string };

export interface PriceQuoteLine {
  categoryId: string;
  name: string;
  quantity: number;
  /** Whole rupiah: price.amount × quantity. */
  lineTotal: number;
}

export interface PriceQuote {
  /** Categories with quantity ≥ 1, category order. */
  lines: PriceQuoteLine[];
  ticketCount: number;
  ticketSubtotal: number;
  /** Once per order (ADR-0010); 0 when ticketCount is 0. */
  adminFee: number;
  total: number;
}

export type QuotableCategory = Pick<Category, 'categoryId' | 'name' | 'price'>;

export interface HoldBookingUseCaseInterface {
  /** Summary prices from the selection (whole rupiah). Pure. */
  quote: (categories: readonly QuotableCategory[], quantities: TicketQuantities, adminFee: number) => PriceQuote;
  /** createBooking → enterPayment (or resume / recover); at most 3 calls, never retried here. */
  execute: (input: HoldBookingInput) => Promise<HoldBookingResult>;
}

type Stage = 'create' | 'payment';

const TRANSIENT_CODES = new Set([
  'INTERNAL_ERROR',
  'PAYMENT_PROVIDER_BUSY',
  'SERVICE_UNAVAILABLE',
  'NETWORK_ERROR',
  'TIMEOUT',
]);
const ACTIVE: ReadonlySet<string> = new Set<ActiveBookingStatus>(['SELECTION', 'PAYMENT_PENDING']);

const statusOf = (error: unknown): number => (error as HttpError | null)?.status ?? 0;
const isTransient = (error: unknown): boolean =>
  TRANSIENT_CODES.has(errorCodeOf(error) ?? '') || statusOf(error) >= 500;
const isUnauthorized = (error: unknown): boolean => errorCodeOf(error) === 'UNAUTHORIZED' || statusOf(error) === 401;

/** A string member of the problem body (HttpError.data), else null. */
const problemField = (error: unknown, field: 'categoryId' | 'nikMasked'): string | null => {
  const data = (error as HttpError | null)?.data;
  if (typeof data !== 'object' || data === null) return null;
  const value = (data as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : null;
};

/** Last 4 digits of "3174 •••• •••• 0004" / "************0004"; null when there are no 4 trailing digits. */
const lastFourOf = (masked: string | null): string | null => masked?.match(/(\d{4})\D*$/)?.[1] ?? null;

/** `retryable` with the stage's bookingId; requestId only when the problem has one ("Kode bantuan"). */
const retryable = (error: unknown, bookingId: string | null): HoldBookingResult => {
  const code = errorCodeOf(error) ?? 'UNKNOWN_ERROR';
  const requestId = (error as HttpError | null)?.requestId;
  return typeof requestId === 'string'
    ? { kind: 'retryable', code, bookingId, requestId }
    : { kind: 'retryable', code, bookingId };
};

/** Non-negative integer, else 0 (the selection use case's rule). */
const countOf = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;

/** One order for both sides of a comparison; the order itself does not matter. */
const byText = (a: string, b: string): number => a.localeCompare(b);

/** Sorted "categoryId:last4" per ticket; from attendees, else "categoryId" × quantity from price.lines. */
const signatureOf = (booking: Booking, withNik: boolean): string[] => {
  if (withNik) {
    return (booking.attendees ?? []).map((a) => `${a.categoryId}:${lastFourOf(a.nikMasked) ?? ''}`).sort(byText);
  }
  return (booking.price?.lines ?? [])
    .flatMap((line) => Array.from({ length: countOf(line.quantity) }, () => line.categoryId))
    .sort(byText);
};

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, i) => value === b[i]);

const quote = (categories: readonly QuotableCategory[], quantities: TicketQuantities, adminFee: number): PriceQuote => {
  const lines: PriceQuoteLine[] = [];
  for (const { categoryId, name, price } of categories) {
    const quantity = countOf(quantities[categoryId]);
    if (quantity >= 1) lines.push({ categoryId, name, quantity, lineTotal: price.amount * quantity });
  }
  const ticketCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const ticketSubtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const fee = ticketCount >= 1 ? adminFee : 0;
  return { lines, ticketCount, ticketSubtotal, adminFee: fee, total: ticketSubtotal + fee };
};

/** FR-16-W1: "Lanjut ke pembayaran" as the v1 two-step hold, with resume, recovery and one result per state. */
export const HoldBookingUseCase = ({
  bookingService,
}: Pick<AwilixRegistry, 'bookingService'>): HoldBookingUseCaseInterface => ({
  quote,
  execute: async ({ eventId, admissionToken, idempotencyKey, tickets, bookingId }) => {
    if (tickets.length === 0 || tickets.some((t) => !t.validationToken)) return { kind: 'not-verified' };
    if (!admissionToken) return { kind: 'admission-invalid' };

    const classify = (error: unknown, stage: Stage, id: string | null): HoldBookingResult => {
      const code = errorCodeOf(error) ?? '';
      if (code === 'ADMISSION_INVALID') return { kind: 'admission-invalid' };
      if (isUnauthorized(error)) return { kind: 'unauthorized' };
      if (code === 'NIK_SEAT_TAKEN' || code === 'DUPLICATE_NIK') {
        const last4 = lastFourOf(problemField(error, 'nikMasked'));
        const slotIndexes = last4 === null ? [] : tickets.flatMap((t, i) => (t.nikLast4 === last4 ? [i] : []));
        return { kind: 'nik-conflict', code, slotIndexes, bookingId: id };
      }
      if (code === 'ATTENDEE_NOT_VALIDATED') return { kind: 'attendees-stale' };
      if (code === 'CATEGORY_SOLD_OUT') {
        return { kind: 'sold-out', categoryId: problemField(error, 'categoryId'), bookingId: id };
      }
      if (code === 'QUANTITY_OVER_RESERVATION') {
        return { kind: 'over-reservation', categoryId: problemField(error, 'categoryId') };
      }
      if (stage === 'payment' && (code === 'BOOKING_NOT_HELD' || code === 'NOT_FOUND' || statusOf(error) === 404)) {
        return { kind: 'not-held' };
      }
      if (isTransient(error)) return retryable(error, id);
      throw error;
    };

    const enter = async (id: string, resumed: boolean): Promise<HoldBookingResult> => {
      try {
        await bookingService.enterPayment(id, admissionToken);
        return { kind: 'held', bookingId: id, resumed };
      } catch (error) {
        return classify(error, 'payment', id);
      }
    };

    const sameOrder = (booking: Booking): boolean => {
      if ((booking.attendees?.length ?? 0) > 0) {
        return sameList(signatureOf(booking, true), tickets.map((t) => `${t.categoryId}:${t.nikLast4}`).sort(byText));
      }
      return sameList(signatureOf(booking, false), tickets.map((t) => t.categoryId).sort(byText));
    };

    const recover = async (): Promise<HoldBookingResult> => {
      let items: Booking[];
      try {
        items = (await bookingService.getActiveBooking()).data.items;
      } catch (error) {
        if (isTransient(error)) return retryable(error, null);
        throw error;
      }
      const found = items.find((b) => b.eventId === eventId && ACTIVE.has(b.status));
      if (!found) return { kind: 'active-booking', bookingId: null, status: null };
      if (!sameOrder(found)) {
        return { kind: 'active-booking', bookingId: found.bookingId, status: found.status as ActiveBookingStatus };
      }
      if (found.status === 'PAYMENT_PENDING') return { kind: 'held', bookingId: found.bookingId, resumed: true };
      return enter(found.bookingId, true);
    };

    if (bookingId) return enter(bookingId, false);

    let created: string;
    try {
      const response = await bookingService.createBooking(admissionToken, idempotencyKey, {
        eventId,
        tickets: tickets.map(({ categoryId, validationToken }) => ({ categoryId, validationToken })),
      });
      created = response.data.bookingId;
    } catch (error) {
      if (errorCodeOf(error) === 'ACCOUNT_HAS_ACTIVE_BOOKING') return recover();
      return classify(error, 'create', null);
    }
    return enter(created, false);
  },
});
