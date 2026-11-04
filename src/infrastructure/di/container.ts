import { createContainer, InjectionMode } from 'awilix';

import type { AwilixRegistry } from './registry.types';

/** The single DI container. PROXY mode: factories receive the cradle and read only what they use. */
const container = createContainer<AwilixRegistry>({ injectionMode: InjectionMode.PROXY, strict: true });

export default container;
