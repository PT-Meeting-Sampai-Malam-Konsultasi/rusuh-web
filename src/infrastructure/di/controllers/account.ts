import { asFunction } from 'awilix';

import AccountController from '@controllers/account.controller';

import container from '../container';

/** Imported by the Account page shell, so this controller and its libraries load only with that page. */
container.register({ accountController: asFunction(AccountController) });
