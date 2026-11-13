import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { asFunction, asValue } from 'awilix';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import { useLoading } from '@contexts/loading.context';
import { useNetworkStatus } from '@contexts/network-status.context';
import { usePageVisible } from '@contexts/page-visibility';
import { usePopupError } from '@contexts/popup-error.context';
import { createConfig } from '@infrastructure/config';
import { createAdmissionStore, MOCK_ADMISSION_TOKEN } from '@infrastructure/adapters/admission-store.adapter';
import { apiErrorReporter, createAnalyticsAdapter } from '@infrastructure/adapters/analytics.adapter';
import { createSentrySink } from '@infrastructure/adapters/sentry.adapter';
import { createDeviceTokenStore } from '@infrastructure/adapters/device-token-store.adapter';
import { createFileSaver } from '@infrastructure/adapters/file-saver.adapter';
import { createPrinter } from '@infrastructure/adapters/printer.adapter';
import { createHttpAdapter } from '@infrastructure/adapters/http.adapter';
import { createQueuePlaceStore } from '@infrastructure/adapters/queue-place-store.adapter';
import { createQueueStreamAdapter } from '@infrastructure/adapters/queue-stream.adapter';
import { createStorageAdapter } from '@infrastructure/adapters/storage.adapter';
import { createTokenStore } from '@infrastructure/adapters/token-store.adapter';
import { createTurnstileAdapter } from '@infrastructure/adapters/turnstile.adapter';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';
import { singleFlight } from '@utils/single-flight';
import { TURNSTILE_SLOT_ID } from '@utils/constants/turnstile';

import container from './container';
import type { AwilixRegistry } from './registry.types';

type Deps = Pick<AwilixRegistry, 'config' | 'storage' | 'tokenStore'>;

export function registerInfrastructure() {
  const locale =
    ({ storage, config }: Pick<Deps, 'storage' | 'config'>) =>
    () =>
      storage.get(STORAGE_KEYS.LANGUAGE) ?? config.defaultLocale;

  // Resolved when a 401 arrives, not now: the use case is registered after the infrastructure. Concurrent 401s share
  // one refresh, because each refresh rotates the cookie and a second one with the old cookie revokes the session.
  const refreshSession = singleFlight(() => container.resolve('refreshSessionUseCase').execute());

  const onError = apiErrorReporter(() => container.resolve('analyticsAdapter'));

  container.register({
    config: asValue(createConfig()),
    storage: asFunction(() => createStorageAdapter()).singleton(),
    tokenStore: asFunction(() => createTokenStore()).singleton(),
    // The mock API accepts a placeholder token so /order works in dev without the queue; real builds start empty.
    admissionStore: asFunction(({ config }: Pick<Deps, 'config'>) =>
      createAdmissionStore(config.apiMock ? { fallbackToken: MOCK_ADMISSION_TOKEN } : {}),
    ).singleton(),
    deviceTokenStore: asFunction(({ storage }: Pick<Deps, 'storage'>) =>
      createDeviceTokenStore({ storage }),
    ).singleton(),
    queuePlaceStore: asFunction(({ storage }: Pick<Deps, 'storage'>) => createQueuePlaceStore({ storage })).singleton(),
    turnstile: asFunction((d: Deps) =>
      createTurnstileAdapter({ siteKey: d.config.turnstileSiteKey, getLocale: locale(d), slotId: TURNSTILE_SLOT_ID }),
    ).singleton(),
    // Sentry only with a DSN (off in local dev and tests); the SDK itself loads after the page is interactive.
    analyticsAdapter: asFunction((d: Deps) =>
      createAnalyticsAdapter(
        d.config.sentryDsn
          ? createSentrySink({
              dsn: d.config.sentryDsn,
              environment: d.config.sentryEnvironment,
              release: d.config.appVersion,
              tracesSampleRate: d.config.sentryTracesSampleRate,
              replayOnErrorRate: d.config.sentryReplayOnErrorRate,
            })
          : {},
        { getLanguage: locale(d) },
      ),
    ).singleton(),
    // The session too: claiming a turn needs it (ADR-0025), and a join with it attaches the place to the account.
    queueHttp: asFunction((d: Deps) =>
      createHttpAdapter({
        baseUrl: d.config.queueApiUrl,
        timeoutMs: d.config.apiTimeoutMs,
        getLocale: locale(d),
        getAccessToken: () => d.tokenStore.getAccessToken(),
        refreshSession,
        onError,
        sendRequestId: d.config.requestIdHeader,
      }),
    ).singleton(),
    coreHttp: asFunction((d: Deps) =>
      createHttpAdapter({
        baseUrl: d.config.coreApiUrl,
        timeoutMs: d.config.apiTimeoutMs,
        getLocale: locale(d),
        getAccessToken: () => d.tokenStore.getAccessToken(),
        refreshSession,
        onError,
        sendRequestId: d.config.requestIdHeader,
      }),
    ).singleton(),
    queueStream: asFunction((d: Deps) => createQueueStreamAdapter({ baseUrl: d.config.queueApiUrl })).singleton(),
    fileSaver: asFunction(() => createFileSaver()).singleton(),
    printer: asFunction(() => createPrinter()).singleton(),

    useTranslation: asValue(useTranslation),
    useQueryTanstack: asValue(useQuery),
    useMutationTanstack: asValue(useMutation),
    useQueryClientTanstack: asValue(useQueryClient),
    useRouterNext: asValue(useRouter),
    usePathnameNext: asValue(usePathname),
    useSearchParamsNext: asValue(useSearchParams),
    useParamsNext: asValue(useParams),

    useLoading: asValue(useLoading),
    usePopupError: asValue(usePopupError),
    useNetworkStatus: asValue(useNetworkStatus),
    usePageVisible: asValue(usePageVisible),
  });
}
