import { asFunction } from 'awilix';

import OrderController from '@controllers/order.controller';

import container from '../container';

/** Imported by the Order page shell, so this controller and its libraries load only with that page. */
container.register({ orderController: asFunction(OrderController) });
