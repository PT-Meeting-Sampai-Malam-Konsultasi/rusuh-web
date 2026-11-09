import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { asFunction, asValue } from 'awilix';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import { useLoading } from '@contexts/loading.context';
import { useNetworkStatus } from '@contexts/network-status.context';
import { usePopupError } from '@contexts/popup-error.context';
import { createConfig } from '@infrastructure/config';
import { createAdmissionStore, MOCK_ADMISSION_TOKEN } from '@infrastructure/adapters/admission-store.adapter';
import { createAnalyticsAdapter } from '@infrastructure/adapters/analytics.adapter';
import { createHttpAdapter } from '@infrastructure/adapters/http.adapter';
import { createQueueStreamAdapter } from '@infrastructure/adapters/queue-stream.adapter';
import { createStorageAdapter } from '@infrastructure/adapters/storage.adapter';
import { createTokenStore } from '@infrastructure/adapters/token-store.adapter';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';

import container from './container';
import type { AwilixRegistry } from './registry.types';

type Deps = Pick<AwilixRegistry, 'config' | 'storage' | 'tokenStore'>;

export function registerInfrastructure() {
  const locale =
    ({ storage, config }: Pick<Deps, 'storage' | 'config'>) =>
    () =>
      storage.get(STORAGE_KEYS.LANGUAGE) ?? config.defaultLocale;

  container.register({
    config: asValue(createConfig()),
    storage: asFunction(() => createStorageAdapter()).singleton(),
    tokenStore: asFunction(() => createTokenStore()).singleton(),
    // The mock API accepts a placeholder token so /order works in dev without the queue; real builds start empty.
    admissionStore: asFunction(({ config }: Pick<Deps, 'config'>) =>
      createAdmissionStore(config.apiMock ? { fallbackToken: MOCK_ADMISSION_TOKEN } : {}),
    ).singleton(),
    analyticsAdapter: asFunction(() => createAnalyticsAdapter()).singleton(),
    queueHttp: asFunction((d: Deps) =>
      createHttpAdapter({ baseUrl: d.config.queueApiUrl, timeoutMs: d.config.apiTimeoutMs, getLocale: locale(d) }),
    ).singleton(),
    // refreshSession is wired by the sign-in feature (NFR-07-W2) once the auth service exists.
    coreHttp: asFunction((d: Deps) =>
      createHttpAdapter({
        baseUrl: d.config.coreApiUrl,
        timeoutMs: d.config.apiTimeoutMs,
        getLocale: locale(d),
        getAccessToken: () => d.tokenStore.getAccessToken(),
      }),
    ).singleton(),
    queueStream: asFunction((d: Deps) => createQueueStreamAdapter({ baseUrl: d.config.queueApiUrl })).singleton(),

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
  });
}
