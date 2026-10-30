import { asFunction } from 'awilix';

import NotFoundController from '@controllers/not-found.controller';

import container from './container';

/** Controllers: asFunction(Controller) — never .singleton(), they call hooks. Added per page by /add-feature. */
export function registerControllers() {
  container.register({
    notFoundController: asFunction(NotFoundController),
  });
}
