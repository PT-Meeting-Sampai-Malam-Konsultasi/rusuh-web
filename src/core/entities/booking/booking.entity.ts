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
  /** Maximum tickets this admission allows, 1–3 (ADR-0024); the order may not exceed it. */
  maxTickets: number;
  /** Fixed amount per order, not per ticket (ADR-0010); shown as "Biaya layanan". */
  adminFee: Money;
  /** End of the 5-minute order window. */
  expiresAt: string;
  serverNow: string;
}
