import { asFunction } from 'awilix';

import { CatalogService } from '@core/services/catalog.service';

import container from './container';

/** Services and use cases: asFunction(Factory).singleton(). Added per feature by /add-feature. */
export function registerServices() {
  container.register({
    catalogService: asFunction(CatalogService).singleton(),
  });
}
