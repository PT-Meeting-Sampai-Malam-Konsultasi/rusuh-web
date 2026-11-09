import type { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { useTranslation } from 'react-i18next';

import type { AdmissionStoreProtocol } from '@core/protocols/admission-store.protocol';
import type { AnalyticsProtocol } from '@core/protocols/analytics.protocol';
import type { HttpProtocol } from '@core/protocols/http.protocol';
import type { QueueStreamProtocol } from '@core/protocols/queue-stream.protocol';
import type { StorageProtocol } from '@core/protocols/storage.protocol';
import type { TokenStoreProtocol } from '@core/protocols/token-store.protocol';
import type { BookingServiceInterface } from '@core/services/booking.service';
import type { CatalogServiceInterface } from '@core/services/catalog.service';
import type { GetHomeEventsUseCaseInterface } from '@core/use_case/catalog/get-home-events.use-case';
import type { HomeControllerInterface } from '@controllers/home.controller';
import type { NotFoundControllerInterface } from '@controllers/not-found.controller';
import type { AppConfig } from '@infrastructure/config';

/** Shapes of the context hooks (implemented in src/contexts, scaffold step 5). */
export interface LoadingApi {
  isLoading: boolean;
  toggleLoading: () => void;
}
export interface PopupErrorInput {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}
export interface PopupErrorApi {
  openPopupError: (input: PopupErrorInput) => void;
  closePopupError: () => void;
}
export interface NetworkStatusApi {
  isOnline: boolean;
}

/**
 * Single source of truth for everything in the container. Every key here MUST have a container.register() call in
 * one of the four registries (infrastructure → services → helpers → controllers); Awilix resolves at runtime, so a
 * missing registration is not a type error. di/__tests__/registry.test.ts checks it.
 */
export interface AwilixRegistry {
  // infrastructure: values and adapters
  config: AppConfig;
  storage: StorageProtocol;
  tokenStore: TokenStoreProtocol;
  admissionStore: AdmissionStoreProtocol;
  analyticsAdapter: AnalyticsProtocol;
  queueHttp: HttpProtocol;
  coreHttp: HttpProtocol;
  queueStream: QueueStreamProtocol;

  // infrastructure: framework hooks (controllers never import these directly)
  useTranslation: typeof useTranslation;
  useQueryTanstack: typeof useQuery;
  useMutationTanstack: typeof useMutation;
  useQueryClientTanstack: typeof useQueryClient;
  useRouterNext: typeof useRouter;
  usePathnameNext: typeof usePathname;
  useSearchParamsNext: typeof useSearchParams;
  useParamsNext: typeof useParams;

  // infrastructure: context hooks
  useLoading: () => LoadingApi;
  usePopupError: () => PopupErrorApi;
  useNetworkStatus: () => NetworkStatusApi;

  // services
  catalogService: CatalogServiceInterface;
  bookingService: BookingServiceInterface;

  // use cases
  getHomeEventsUseCase: GetHomeEventsUseCaseInterface;

  // helpers
  ERROR_CODE_MAP: Readonly<Record<string, string>>;

  // controllers
  homeController: HomeControllerInterface;
  notFoundController: NotFoundControllerInterface;

  // services, use cases and more controllers are added here by /add-feature
}
