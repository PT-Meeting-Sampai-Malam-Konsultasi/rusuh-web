import { asFunction } from 'awilix';

import { createMockSnap, createSnapAdapter } from '@infrastructure/adapters/snap.adapter';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import { mockSnapOutcome, readMockScenario } from '@infrastructure/mocks/scenario';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';

import container from '../container';

/** Imported by the payment page shell: the Snap adapter (and snap.js) load only with that page. */
container.register({
  snap: asFunction(({ config, storage }: Pick<AwilixRegistry, 'config' | 'storage'>) =>
    config.apiMock
      ? createMockSnap({ outcome: () => mockSnapOutcome(readMockScenario()) })
      : createSnapAdapter({
          scriptUrl: config.midtransSnapUrl,
          clientKey: config.midtransClientKey,
          getLocale: () => storage.get(STORAGE_KEYS.LANGUAGE) ?? config.defaultLocale,
        }),
  ).singleton(),
});
