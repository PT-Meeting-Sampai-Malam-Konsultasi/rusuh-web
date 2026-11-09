import { asFunction } from 'awilix';

import NotFoundController from '@controllers/not-found.controller';

import container from '../container';

/** Imported by the NotFound page shell, so this controller and its libraries load only with that page. */
container.register({ notFoundController: asFunction(NotFoundController) });
