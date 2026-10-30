import { registerControllers } from './controllers.registry';
import { registerHelpers } from './helpers.registry';
import { registerInfrastructure } from './infrastructure.registry';
import { registerServices } from './services.registry';

let registered = false;

/** Registers everything once, in the strict order infrastructure → services → helpers → controllers. */
export function registerAll() {
  if (registered) return;
  registerInfrastructure();
  registerServices();
  registerHelpers();
  registerControllers();
  registered = true;
}
