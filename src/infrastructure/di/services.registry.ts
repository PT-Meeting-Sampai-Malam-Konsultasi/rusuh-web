import { asFunction } from 'awilix';

import { BookingService } from '@core/services/booking.service';
import { CatalogService } from '@core/services/catalog.service';
import { GetHomeEventsUseCase } from '@core/use_case/catalog/get-home-events.use-case';

import container from './container';

/** Services and use cases: asFunction(Factory).singleton(). Added per feature by /add-feature. */
export function registerServices() {
  container.register({
    catalogService: asFunction(CatalogService).singleton(),
    bookingService: asFunction(BookingService).singleton(),
    getHomeEventsUseCase: asFunction(GetHomeEventsUseCase).singleton(),
  });
}
