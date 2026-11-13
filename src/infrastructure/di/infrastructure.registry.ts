import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { asFunction, asValue } from 'awilix';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import { useConsent } from '@contexts/consent.context';
import { useLoading } from '@contexts/loading.context';
import { useNetworkStatus } from '@contexts/network-status.context';
import { usePageVisible } from '@contexts/page-visibility';
import { usePopupError } from '@contexts/popup-error.context';
import { createConfig } from '@infrastructure/config';
import { createConsentStore } from '@infrastructure/adapters/consent-store.adapter';
import { createAdmissionStore, MOCK_ADMISSION_TOKEN } from '@infrastructure/adapters/admission-store.adapter';
import { apiErrorReporter, combineSinks, createAnalyticsAdapter } from '@infrastructure/adapters/analytics.adapter';
import { createGa4Sink } from '@infrastructure/adapters/ga4.adapter';
import { createSentrySink, scrubUrl } from '@infrastructure/adapters/sentry.adapter';
import { createDeviceTokenStore } from '@infrastructure/adapters/device-token-store.adapter';
import { createFileSaver } from '@infrastructure/adapters/file-saver.adapter';
import { createPrinter } from '@infrastructure/adapters/printer.adapter';
import { createHttpAdapter } from '@infrastructure/adapters/http.adapter';
import { createQueuePlaceStore } from '@infrastructure/adapters/queue-place-store.adapter';
import { createStorageAdapter } from '@infrastructure/adapters/storage.adapter';
import { createTokenStore } from '@infrastructure/adapters/token-store.adapter';
import { createDisabledTurnstile, createTurnstileAdapter } from '@infrastructure/adapters/turnstile.adapter';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';
import { singleFlight } from '@utils/single-flight';
import { TURNSTILE_SLOT_ID } from '@utils/constants/turnstile';

import container from './container';
import type { AwilixRegistry } from './registry.types';

type Deps = Pick<AwilixRegistry, 'config' | 'storage' | 'tokenStore' | 'consentStore'>;

export function registerInfrastructure() {
  const locale =
    ({ storage, config }: Pick<Deps, 'storage' | 'config'>) =>
    () =>
      storage.get(STORAGE_KEYS.LANGUAGE) ?? config.defaultLocale;

  // Resolved when a 401 arrives, not now: the use case is registered after the infrastructure. Concurrent 401s share
  // one refresh, because each refresh rotates the cookie and a second one with the old cookie revokes the session.
  // A page load starts without an access token, so the first refresh also tells analytics who is signed in.
  const refreshSession = singleFlight(async () => {
    const user = await container.resolve('refreshSessionUseCase').execute();
    container.resolve('analyticsAdapter').setUser(user?.userId ?? null);
    return user !== null;
  });

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
    consentStore: asFunction(({ storage }: Pick<Deps, 'storage'>) => createConsentStore({ storage })).singleton(),
    turnstile: asFunction((d: Deps) =>
      d.config.turnstileEnabled
        ? createTurnstileAdapter({
            siteKey: d.config.turnstileSiteKey,
            getLocale: locale(d),
            slotId: TURNSTILE_SLOT_ID,
          })
        : createDisabledTurnstile(),
    ).singleton(),
    // Sentry only with a DSN (off in local dev and tests); the SDK itself loads after the page is interactive.
    // GA4 only with the analytics flag and a measurement ID, and then only after a yes to the cookie.
    analyticsAdapter: asFunction((d: Deps) => {
      const { config } = d;
      const sinks = [
        config.sentryDsn
          ? createSentrySink({
              dsn: config.sentryDsn,
              environment: config.sentryEnvironment,
              release: config.appVersion,
              tracesSampleRate: config.sentryTracesSampleRate,
              replayOnErrorRate: config.sentryReplayOnErrorRate,
            })
          : {},
        config.analyticsEnabled && config.gaMeasurementId
          ? createGa4Sink({ measurementId: config.gaMeasurementId, consent: d.consentStore, scrubUrl })
          : {},
      ];
      return createAnalyticsAdapter(combineSinks(...sinks), { getLanguage: locale(d) });
    }).singleton(),
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
    useConsent: asValue(useConsent),
  });
}
