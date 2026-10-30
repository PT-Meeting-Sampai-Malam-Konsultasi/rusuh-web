import { asValue } from 'awilix';

import { ERROR_CODE_MAP } from '@utils/constants/error-codes';

import container from './container';

/** Constants and context-bridge helpers: asValue(...). */
export function registerHelpers() {
  container.register({
    ERROR_CODE_MAP: asValue(ERROR_CODE_MAP),
  });
}
