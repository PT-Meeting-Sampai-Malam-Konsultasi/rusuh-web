import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  accountService: true,
  authService: true,
  catalogService: true,
  bookingService: true,
  deviceService: true,
  queueService: true,
  getHomeEventsUseCase: true,
  getOrderCategoriesUseCase: true,
  joinQueueUseCase: true,
  followQueueUseCase: true,
  refreshSessionUseCase: true,
  requestSignInCodeUseCase: true,
  verifySignInCodeUseCase: true,
  ERROR_CODE_MAP: true,
  homeController: true,
  loginController: true,
  notFoundController: true,
  orderController: true,
  queueController: true,
} satisfies Record<keyof AwilixRegistry, true>;

const CONTROLLERS_DIR = join(__dirname, '../controllers');
const PAGES_DIR = join(__dirname, '../../../presentation/pages');

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

  beforeAll(async () => {
    // Each page shell imports its controller registration; load them all here.
    for (const file of readdirSync(CONTROLLERS_DIR)) await import(`../controllers/${file.replace(/\.ts$/, '')}`);
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
    expect(typeof container.resolve('followQueueUseCase').poll).toBe('function');
  });

  it('wires the auth and account services', () => {
    expect(typeof container.resolve('authService').requestOtp).toBe('function');
    expect(typeof container.resolve('accountService').updateProfile).toBe('function');
    expect(container.resolve('requestSignInCodeUseCase')).toBe(container.resolve('requestSignInCodeUseCase'));
    expect(typeof container.resolve('verifySignInCodeUseCase').execute).toBe('function');
  });

  it('has every page shell import the registration of the controller it resolves', () => {
    const registered = new Map(
      readdirSync(CONTROLLERS_DIR).map((file) => {
        const code = readFileSync(join(CONTROLLERS_DIR, file), 'utf8');
        return [code.match(/register\(\{ (\w+):/)?.[1], file.replace(/\.ts$/, '')];
      }),
    );
    for (const page of readdirSync(PAGES_DIR)) {
      const shell = readFileSync(join(PAGES_DIR, page, 'index.tsx'), 'utf8');
      for (const [, key] of shell.matchAll(/container\.resolve<\w+>\('(\w+Controller)'\)/g)) {
        expect(registered.get(key), `${key} has no file in di/controllers`).toBeDefined();
        expect(shell, `${page} must import its controller registration`).toContain(
          `import '@infrastructure/di/controllers/${registered.get(key)}';`,
        );
      }
    }
  });
});
