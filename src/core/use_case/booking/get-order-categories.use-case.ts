import type { Category } from '@core/entities/booking/booking.entity';
import type { Money } from '@core/entities/catalog/catalog.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export interface GetOrderCategoriesInput {
  eventId: string;
  /** From the admission store; null after a reload (memory only). Null or '' → claim again if a place is stored. */
  admissionToken: string | null;
}

export type OrderCategoriesResult =
  | {
      kind: 'ok';
      categories: Category[];
      maxTicketsPerOrder: number;
      /** Units reserved for this admission, 1–3 (ADR-0004). */
      reservedUnits: number;
      adminFee: Money;
      /** End of the 5-minute order window (ADR-0005); the same after a re-claim. Timer: expiresAt − serverNow. */
      expiresAt: string;
      serverNow: string;
      /** True when this call had no token and claimed the turn again (a reload), for analytics (FR-19-W1). */
      resumed: boolean;
    }
  /**
   * No live admission the order page can use: the waiting room takes over (no stored place, sign in, wait, sold out,
   * rejected token).
   */
  | { kind: 'admission-invalid' }
  /** A re-claim ran and said the turn is over (MISSED / EXPIRED, and MOVED: see the design): time's up (FR-18). */
  | { kind: 'window-ended' };

export interface GetOrderCategoriesUseCaseInterface {
  execute: (input: GetOrderCategoriesInput) => Promise<OrderCategoriesResult>;
}

type Deps = Pick<AwilixRegistry, 'bookingService' | 'claimTurnUseCase' | 'queuePlaceStore'>;

/** The HTTP adapter rejects with a plain HttpError object, so the check is structural. */
const isAdmissionInvalid = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as HttpError).code === 'ADMISSION_INVALID';

export const GetOrderCategoriesUseCase = ({
  bookingService,
  claimTurnUseCase,
  queuePlaceStore,
}: Deps): GetOrderCategoriesUseCaseInterface => {
  /** One categories call with this token; a rejected token is an outcome, never a reason to claim. */
  const load = async (eventId: string, token: string, resumed: boolean): Promise<OrderCategoriesResult> => {
    try {
      const { data } = await bookingService.getCategories(eventId, token);
      return {
        kind: 'ok',
        categories: data.categories,
        maxTicketsPerOrder: data.maxTicketsPerOrder,
        reservedUnits: data.reservedUnits,
        adminFee: data.adminFee,
        expiresAt: data.expiresAt,
        serverNow: data.serverNow,
        resumed,
      };
    } catch (error) {
      if (isAdmissionInvalid(error)) return { kind: 'admission-invalid' };
      throw error;
    }
  };

  return {
    execute: async ({ eventId, admissionToken }) => {
      if (admissionToken) return load(eventId, admissionToken, false);
      // Never queued here (or storage cleared): not a time's-up; the waiting room joins (read only, no request).
      if (!queuePlaceStore.get(eventId)) return { kind: 'admission-invalid' };
      // FR-19-W1: a reload lost the in-memory token. The claim is idempotent (same slot, same lease end) and stores
      // the token in admissionStore itself; a thrown claim error propagates.
      const claim = await claimTurnUseCase.execute(eventId);
      if (claim.kind === 'admitted') return load(eventId, claim.admission.admissionToken, true);
      if (claim.kind === 'missed') return { kind: 'window-ended' };
      return { kind: 'admission-invalid' }; // sign-in, retry, paused, sold-out: the waiting room handles them
    },
  };
};
