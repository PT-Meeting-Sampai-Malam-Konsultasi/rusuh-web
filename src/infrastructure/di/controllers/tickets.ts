import { asFunction } from 'awilix';

import TicketsController from '@controllers/tickets.controller';

import container from '../container';

/** Imported by the My tickets page shell, so this controller and its libraries load only with that page. */
container.register({ ticketsController: asFunction(TicketsController) });
