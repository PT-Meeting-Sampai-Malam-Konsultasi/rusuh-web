import container from './container';

/** Controllers: asFunction(Controller) — never .singleton(), they call hooks. Added per page by /add-feature. */
export function registerControllers() {
  container.register({});
}
