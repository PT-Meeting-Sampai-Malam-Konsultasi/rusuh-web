// Booking types, matching rusuh-documentation/api/openapi.yaml (Category, getCategories).
import type { Money } from '@core/entities/catalog/catalog.entity';

/** No seat numbers: entry by category (T-11). */
export type Seating = 'standing' | 'seated';

/** The label the page shows ("Tersedia", "Hampir habis", "Habis"); a snapshot at load (Q-20). */
export type CategoryAvailability = 'available' | 'almost_gone' | 'sold_out';

export interface Category {
  categoryId: string;
  name: string;
  /** In the request language (ADR-0014). */
  description?: string;
  seating?: Seating;
  entryGate?: string;
  price: Money;
  availability: CategoryAvailability;
  /** Snapshot count; optional, not shown in the HiFi. */
  available?: number;
}

export interface GetCategoriesResponse {
  eventId: string;
  categories: Category[];
  /** Policy maximum per order (N-1). */
  maxTicketsPerOrder: number;
  /** Units reserved for this admission, 1–3 (ADR-0004); the order may not exceed it. */
  reservedUnits: number;
  /** Fixed amount per order, not per ticket (ADR-0010); shown as "Biaya layanan". */
  adminFee: Money;
  /** End of the 5-minute order window. */
  expiresAt: string;
  serverNow: string;
}

// Bookings and tickets (Booking, Ticket, listMyTickets, getBooking).

/** Only PAID bookings have tickets. */
export type BookingStatus = 'HELD' | 'PAID' | 'EXPIRED' | 'CANCELLED';

export type PaymentMethod =
  'qris' | 'gopay' | 'shopeepay' | 'bca_va' | 'mandiri_va' | 'bni_va' | 'bri_va' | 'permata_va' | 'cimb_va' | 'card';

export interface PriceLine {
  categoryId: string;
  name: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
}

export interface PriceBreakdown {
  lines: PriceLine[];
  ticketSubtotal: Money;
  /** Fixed per order (ADR-0010). */
  adminFee: Money;
  total: Money;
}

/** One e-ticket: what the gate checks, with the holder's KTP (ADR-0007). */
export interface Ticket {
  ticketId: string;
  /** Printed under the QR; staff type it when the QR does not scan. */
  ticketCode?: string;
  bookingId: string;
  eventId?: string;
  categoryId?: string;
  categoryName: string;
  seating?: Seating;
  entryGate?: string;
  /** Must match the KTP at the gate. */
  holderName: string;
  /** First 4 and last 4 digits; the full NIK never reaches the web. */
  nikMasked: string;
  /** Signed payload, checked at the gate; scans once. */
  qrPayload: string;
  issuedAt?: string;
}

export interface ListMyTicketsResponse {
  items: Ticket[];
}

export interface Booking {
  bookingId: string;
  eventId: string;
  status: BookingStatus;
  price: PriceBreakdown;
  /** "Pesanan RSH-26-084731"; also the PDF file name. */
  orderCode?: string;
  tickets?: Ticket[];
  paidAt?: string | null;
  paymentMethod?: PaymentMethod | null;
  createdAt: string;
  serverNow: string;
}
