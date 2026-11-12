import type { EventSummary, ListEventsResponse } from '@core/entities/catalog/catalog.entity';
import type { HttpResponse } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export interface CatalogServiceInterface {
  /** `GET /core/events`: every event with its sale state, cached at the CDN for 5–10 s. */
  listEvents: () => Promise<HttpResponse<ListEventsResponse>>;
  /** `GET /core/events/{eventId}`: public event details, no prices or live stock. 404 NOT_FOUND for an unknown id. */
  getEvent: (eventId: string) => Promise<HttpResponse<EventSummary>>;
}

export const CatalogService = ({ coreHttp }: Pick<AwilixRegistry, 'coreHttp'>): CatalogServiceInterface => ({
  listEvents: () => coreHttp.get<ListEventsResponse>('core/events'),
  getEvent: (eventId) => coreHttp.get<EventSummary>(`core/events/${encodeURIComponent(eventId)}`),
});
