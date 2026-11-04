import { beforeAll, describe, expect, it, vi } from 'vitest';

import container from '../container';
import { registerAll } from '../index';
import type { AwilixRegistry } from '../registry.types';

// Listing every key with `satisfies` makes TypeScript fail when AwilixRegistry gains a key that is not listed here;
// the test then fails when a listed key has no registration.
const KEYS = {
  config: true,
  storage: true,
  tokenStore: true,
  analyticsAdapter: true,
  queueHttp: true,
  coreHttp: true,
  queueStream: true,
  useTranslation: true,
  useQueryTanstack: true,
  useMutationTanstack: true,
  useQueryClientTanstack: true,
  useRouterNext: true,
  usePathnameNext: true,
  useSearchParamsNext: true,
  useParamsNext: true,
  useLoading: true,
  usePopupError: true,
  useNetworkStatus: true,
  catalogService: true,
  ERROR_CODE_MAP: true,
  notFoundController: true,
} satisfies Record<keyof AwilixRegistry, true>;

describe('DI registries', () => {
  beforeAll(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '0.0.0-test');
    vi.stubEnv('NEXT_PUBLIC_QUEUE_API_URL', 'https://queue.test/v1');
    vi.stubEnv('NEXT_PUBLIC_CORE_API_URL', 'https://core.test/v1');
    vi.stubEnv('NEXT_PUBLIC_MIDTRANS_CLIENT_KEY', 'SB-test');
    vi.stubEnv('NEXT_PUBLIC_MIDTRANS_SNAP_URL', 'https://snap.test/snap.js');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-test');
    registerAll();
    registerAll(); // idempotent
  });

  it('registers every key of AwilixRegistry, and nothing else', () => {
    expect(Object.keys(container.registrations).sort()).toEqual(Object.keys(KEYS).sort());
  });

  it('resolves the adapters as singletons', () => {
    expect(container.resolve('coreHttp')).toBe(container.resolve('coreHttp'));
    expect(container.resolve('config').coreApiUrl).toBe('https://core.test/v1');
    expect(typeof container.resolve('queueStream').open).toBe('function');
  });
});
