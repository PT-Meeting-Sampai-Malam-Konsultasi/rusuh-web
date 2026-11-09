import type { Category } from '@core/entities/booking/booking.entity';
import type { Money } from '@core/entities/catalog/catalog.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export interface GetOrderCategoriesInput {
  eventId: string;
  /** From the admission store; null when the buyer has no live turn on this tab. */
  admissionToken: string | null;
}

export type OrderCategoriesResult =
  | {
      kind: 'ok';
      categories: Category[];
      maxTicketsPerOrder: number;
      maxTickets: number;
      adminFee: Money;
      /** End of the 5-minute order window (ADR-0005); the timer (FR-17-W1) uses expiresAt − serverNow. */
      expiresAt: string;
      serverNow: string;
    }
  | { kind: 'admission-invalid' };

export interface GetOrderCategoriesUseCaseInterface {
  execute: (input: GetOrderCategoriesInput) => Promise<OrderCategoriesResult>;
}

/** The HTTP adapter rejects with a plain HttpError object, so the check is structural. */
const isAdmissionInvalid = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as HttpError).code === 'ADMISSION_INVALID';

export const GetOrderCategoriesUseCase = ({
  bookingService,
}: Pick<AwilixRegistry, 'bookingService'>): GetOrderCategoriesUseCaseInterface => ({
  execute: async ({ eventId, admissionToken }) => {
    if (!admissionToken) return { kind: 'admission-invalid' };
    try {
      const { data } = await bookingService.getCategories(eventId, admissionToken);
      return {
        kind: 'ok',
        categories: data.categories,
        maxTicketsPerOrder: data.maxTicketsPerOrder,
        maxTickets: data.maxTickets,
        adminFee: data.adminFee,
        expiresAt: data.expiresAt,
        serverNow: data.serverNow,
      };
    } catch (error) {
      if (isAdmissionInvalid(error)) return { kind: 'admission-invalid' };
      throw error;
    }
  },
});
