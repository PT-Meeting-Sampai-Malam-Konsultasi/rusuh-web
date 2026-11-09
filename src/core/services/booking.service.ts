import type { GetCategoriesResponse } from '@core/entities/booking/booking.entity';
import type { HttpResponse } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

/** Admission-gated core calls carry the token from claimTurn in this header (NFR-07, ADR-0005). */
export const ADMISSION_TOKEN_HEADER = 'X-Admission-Token';

export interface BookingServiceInterface {
  /**
   * `GET /events/{eventId}/categories`: categories, prices, stock snapshot and the order countdown.
   * Needs a live admission token (403 ADMISSION_INVALID otherwise) and a session (401 UNAUTHORIZED).
   */
  getCategories: (eventId: string, admissionToken: string) => Promise<HttpResponse<GetCategoriesResponse>>;
}

export const BookingService = ({ coreHttp }: Pick<AwilixRegistry, 'coreHttp'>): BookingServiceInterface => ({
  getCategories: (eventId, admissionToken) =>
    coreHttp.get<GetCategoriesResponse>(`events/${encodeURIComponent(eventId)}/categories`, {
      headers: { [ADMISSION_TOKEN_HEADER]: admissionToken },
    }),
});
