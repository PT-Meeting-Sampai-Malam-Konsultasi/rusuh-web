import type { AppConfig } from '@infrastructure/config';

import { createHandlers } from './handlers/handlers';
import { readMockScenario } from './scenario';

// On globalThis, not in module scope, so a hot reload of this file does not start a second worker.
const state = globalThis as typeof globalThis & { __rusuhMockApi?: Promise<void> };

/**
 * Starts the mock API in the browser once; loaded with a dynamic import only when `NEXT_PUBLIC_API_MOCK=true`.
 * Idempotent: React runs effects twice in development, and MSW can patch the network globals only once.
 */
export function startMockApi(config: Pick<AppConfig, 'coreApiUrl' | 'queueApiUrl'>): Promise<void> {
  state.__rusuhMockApi ??= start(config);
  return state.__rusuhMockApi;
}

async function start(config: Pick<AppConfig, 'coreApiUrl' | 'queueApiUrl'>) {
  // msw/browser has no Node build; Next also resolves client modules for prerendering in Node, so the import is
  // dynamic and optional there (this function only ever runs in the browser).
  const { setupWorker } = await import(/* turbopackOptional: true */ 'msw/browser');
  const worker = setupWorker(...createHandlers({ ...config, getScenario: readMockScenario, now: () => new Date() }));
  // Fonts, images and pages go to the network as usual; only the handlers above are mocked.
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
}
