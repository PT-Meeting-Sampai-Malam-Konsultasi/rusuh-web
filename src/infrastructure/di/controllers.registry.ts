import { asFunction } from 'awilix';

import HomeController from '@controllers/home.controller';
import NotFoundController from '@controllers/not-found.controller';
import OrderController from '@controllers/order.controller';

import container from './container';

/** Controllers: asFunction(Controller) — never .singleton(), they call hooks. Added per page by /add-feature. */
export function registerControllers() {
  container.register({
    homeController: asFunction(HomeController),
    notFoundController: asFunction(NotFoundController),
    orderController: asFunction(OrderController),
  });
}
