import { asFunction } from 'awilix';

import InfoController from '@controllers/info.controller';

import container from '../container';

/** Imported by the Info page shell (terms, privacy, refund, help), so this controller loads only with those pages. */
container.register({ infoController: asFunction(InfoController) });
