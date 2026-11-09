import { asFunction } from 'awilix';

import { BookingService } from '@core/services/booking.service';
import { CatalogService } from '@core/services/catalog.service';
import { DeviceService } from '@core/services/device.service';
import { QueueService } from '@core/services/queue.service';
import { GetOrderCategoriesUseCase } from '@core/use_case/booking/get-order-categories.use-case';
import { GetHomeEventsUseCase } from '@core/use_case/catalog/get-home-events.use-case';
import { JoinQueueUseCase } from '@core/use_case/queue/join-queue.use-case';

import container from './container';

/** Services and use cases: asFunction(Factory).singleton(). Added per feature by /add-feature. */
export function registerServices() {
  container.register({
    catalogService: asFunction(CatalogService).singleton(),
    bookingService: asFunction(BookingService).singleton(),
    deviceService: asFunction(DeviceService).singleton(),
    queueService: asFunction(QueueService).singleton(),
    getHomeEventsUseCase: asFunction(GetHomeEventsUseCase).singleton(),
    getOrderCategoriesUseCase: asFunction(GetOrderCategoriesUseCase).singleton(),
    joinQueueUseCase: asFunction(JoinQueueUseCase).singleton(),
  });
}
