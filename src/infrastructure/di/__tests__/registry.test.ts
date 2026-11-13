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
  consentStore: true,
  turnstile: true,
  analyticsAdapter: true,
  queueHttp: true,
  coreHttp: true,
  fileSaver: true,
  printer: true,
  qrEncoder: true,
  snap: true,
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
  usePageVisible: true,
  useConsent: true,
  accountService: true,
  authService: true,
  catalogService: true,
  bookingService: true,
  deviceService: true,
  queueService: true,
  getHomeEventsUseCase: true,
  getOrderCategoriesUseCase: true,
  orderTicketSelectionUseCase: true,
  validateAttendeeUseCase: true,
  endOrderWindowUseCase: true,
  holdBookingUseCase: true,
  joinQueueUseCase: true,
  followQueueUseCase: true,
  claimTurnUseCase: true,
  leaveQueueUseCase: true,
  refreshSessionUseCase: true,
  signOutUseCase: true,
  requestSignInCodeUseCase: true,
  verifySignInCodeUseCase: true,
  getMyOrdersUseCase: true,
  getETicketUseCase: true,
  payBookingUseCase: true,
  ERROR_CODE_MAP: true,
  accountController: true,
  homeController: true,
  infoController: true,
  loginController: true,
  notFoundController: true,
  orderController: true,
  paymentController: true,
  queueController: true,
  ticketDetailController: true,
  ticketsController: true,
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
    await Promise.all(Object.values(import.meta.glob('../controllers/*.ts')).map((load) => load()));
  });

  it('registers every key of AwilixRegistry, and nothing else', () => {
    expect(Object.keys(container.registrations).sort()).toEqual(Object.keys(KEYS).sort());
  });

  it('resolves the adapters as singletons', () => {
    expect(container.resolve('coreHttp')).toBe(container.resolve('coreHttp'));
    expect(container.resolve('config').coreApiUrl).toBe('https://core.test/v1');
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
    expect(typeof container.resolve('claimTurnUseCase').execute).toBe('function');
    expect(typeof container.resolve('leaveQueueUseCase').execute).toBe('function');
  });

  it('wires the auth and account services', () => {
    expect(typeof container.resolve('authService').requestOtp).toBe('function');
    expect(typeof container.resolve('accountService').updateProfile).toBe('function');
    expect(container.resolve('requestSignInCodeUseCase')).toBe(container.resolve('requestSignInCodeUseCase'));
    expect(typeof container.resolve('verifySignInCodeUseCase').execute).toBe('function');
  });

  it('wires the e-ticket adapters and use cases (FR-22-W1)', () => {
    expect(container.resolve('qrEncoder')).toBe(container.resolve('qrEncoder'));
    expect(container.resolve('qrEncoder').encode('RSH1.x').length).toBeGreaterThan(20);
    expect(typeof container.resolve('fileSaver').save).toBe('function');
    expect(typeof container.resolve('getMyOrdersUseCase').execute).toBe('function');
    expect(typeof container.resolve('getETicketUseCase').execute).toBe('function');
    expect(typeof container.resolve('printer').print).toBe('function');
  });

  it('wires the validate attendee use case as a singleton', () => {
    expect(container.resolve('validateAttendeeUseCase')).toBe(container.resolve('validateAttendeeUseCase'));
    expect(typeof container.resolve('validateAttendeeUseCase').checkNik).toBe('function');
    expect(typeof container.resolve('validateAttendeeUseCase').execute).toBe('function');
    expect(container.resolve('endOrderWindowUseCase')).toBe(container.resolve('endOrderWindowUseCase'));
    expect(typeof container.resolve('endOrderWindowUseCase').execute).toBe('function');
  });

  it('wires the page-scoped Snap adapter (FR-20-W1); payment goes through the booking service', () => {
    expect(container.resolve('bookingService').checkPaymentStatus).toBeTypeOf('function');
    expect(container.resolve('snap')).toBe(container.resolve('snap'));
    expect(typeof container.resolve('snap').pay).toBe('function');
    expect(typeof container.resolve('snap').load).toBe('function');
  });

  it('wires the pay booking use case as a singleton (FR-20-W1)', () => {
    const useCase = container.resolve('payBookingUseCase');
    expect(useCase).toBe(container.resolve('payBookingUseCase'));
    expect(typeof useCase.load).toBe('function');
    expect(typeof useCase.pay).toBe('function');
    expect(typeof useCase.checkStatus).toBe('function');
  });

  it('wires the hold booking use case as a singleton', () => {
    expect(container.resolve('holdBookingUseCase')).toBe(container.resolve('holdBookingUseCase'));
    expect(typeof container.resolve('holdBookingUseCase').quote).toBe('function');
    expect(typeof container.resolve('holdBookingUseCase').execute).toBe('function');
  });

  it('wires the order ticket selection use case as a singleton', () => {
    expect(container.resolve('orderTicketSelectionUseCase')).toBe(container.resolve('orderTicketSelectionUseCase'));
    expect(typeof container.resolve('orderTicketSelectionUseCase').orderLimit).toBe('function');
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
