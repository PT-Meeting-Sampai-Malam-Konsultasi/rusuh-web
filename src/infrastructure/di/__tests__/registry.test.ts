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
  admissionStore: true,
  deviceTokenStore: true,
  queuePlaceStore: true,
  turnstile: true,
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
  bookingService: true,
  deviceService: true,
  queueService: true,
  getHomeEventsUseCase: true,
  getOrderCategoriesUseCase: true,
  joinQueueUseCase: true,
  ERROR_CODE_MAP: true,
  homeController: true,
  notFoundController: true,
  orderController: true,
  queueController: true,
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
    expect(container.resolve('admissionStore')).toBe(container.resolve('admissionStore'));
    expect(container.resolve('bookingService')).toBe(container.resolve('bookingService'));
    expect(container.resolve('deviceTokenStore')).toBe(container.resolve('deviceTokenStore'));
    expect(container.resolve('queuePlaceStore')).toBe(container.resolve('queuePlaceStore'));
    expect(typeof container.resolve('turnstile').getToken).toBe('function');
  });

  it('keeps the admission store empty unless the mock API is on', () => {
    const store = container.resolve('admissionStore');
    const expected = container.resolve('config').apiMock ? 'mock-admission-token' : null;
    expect(store.get('evt_never_claimed')).toBe(expected);
  });

  it('wires the queue services and the join use case', () => {
    expect(typeof container.resolve('deviceService').registerDevice).toBe('function');
    expect(typeof container.resolve('queueService').joinQueue).toBe('function');
    expect(container.resolve('joinQueueUseCase')).toBe(container.resolve('joinQueueUseCase'));
  });
});
