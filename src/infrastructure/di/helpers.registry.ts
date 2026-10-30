import { asValue } from 'awilix';

import container from './container';

/** Constants and context-bridge helpers: asValue(...). */
export function registerHelpers() {
  container.register({
    // TODO: replace in scaffold step 5 with the full map from utils/constants/error-codes.ts.
    ERROR_CODE_MAP: asValue({}),
  });
}
