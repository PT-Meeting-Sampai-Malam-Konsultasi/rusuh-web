import type { ListEventsResponse } from '@core/entities/catalog/catalog.entity';
import type { HttpResponse } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export interface CatalogServiceInterface {
  /** `GET /events`: every event with its sale state, cached at the CDN for 5–10 s. */
  listEvents: () => Promise<HttpResponse<ListEventsResponse>>;
}

export const CatalogService = ({ coreHttp }: Pick<AwilixRegistry, 'coreHttp'>): CatalogServiceInterface => ({
  listEvents: () => coreHttp.get<ListEventsResponse>('events'),
});
