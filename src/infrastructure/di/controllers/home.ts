import { asFunction } from 'awilix';

import HomeController from '@controllers/home.controller';

import container from '../container';

/** Imported by the Home page shell, so this controller and its libraries load only with that page. */
container.register({ homeController: asFunction(HomeController) });
