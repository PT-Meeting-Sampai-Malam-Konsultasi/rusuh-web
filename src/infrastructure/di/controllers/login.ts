import { asFunction } from 'awilix';

import LoginController from '@controllers/login.controller';

import container from '../container';

/** Imported by the Login page shell, so this controller and its libraries load only with that page. */
container.register({ loginController: asFunction(LoginController) });
