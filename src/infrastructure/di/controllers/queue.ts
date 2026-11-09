import { asFunction } from 'awilix';

import QueueController from '@controllers/queue.controller';

import container from '../container';

/** Imported by the Queue page shell, so this controller and its libraries load only with that page. */
container.register({ queueController: asFunction(QueueController) });
