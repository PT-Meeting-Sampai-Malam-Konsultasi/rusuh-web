import { registerHelpers } from './helpers.registry';
import { registerInfrastructure } from './infrastructure.registry';
import { registerServices } from './services.registry';

let registered = false;

/**
 * Registers the shared layers once, in the strict order infrastructure → services → helpers. Controllers are not
 * here: each page shell imports its own `./controllers/<page>` file, so a page's libraries stay out of other pages.
 */
export function registerAll() {
  if (registered) return;
  registerInfrastructure();
  registerServices();
  registerHelpers();
  registered = true;
}
