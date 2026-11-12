import { asFunction } from 'awilix';

import TicketDetailController from '@controllers/ticket-detail.controller';
import { createQrEncoder } from '@infrastructure/adapters/qr-encoder.adapter';

import container from '../container';

/** Imported by the e-ticket page shell, so this controller and the QR library load only with that page. */
container.register({ ticketDetailController: asFunction(TicketDetailController) });
container.register({ qrEncoder: asFunction(() => createQrEncoder()).singleton() });
