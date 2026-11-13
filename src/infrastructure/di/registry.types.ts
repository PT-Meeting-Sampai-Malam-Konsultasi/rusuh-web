import type { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { useTranslation } from 'react-i18next';

import type { AdmissionStoreProtocol } from '@core/protocols/admission-store.protocol';
import type { AnalyticsProtocol } from '@core/protocols/analytics.protocol';
import type { AnalyticsConsent, ConsentStoreProtocol } from '@core/protocols/consent-store.protocol';
import type { DeviceTokenStoreProtocol } from '@core/protocols/device-token-store.protocol';
import type { FileSaverProtocol } from '@core/protocols/file-saver.protocol';
import type { PrinterProtocol } from '@core/protocols/printer.protocol';
import type { HttpProtocol } from '@core/protocols/http.protocol';
import type { QrEncoderProtocol } from '@core/protocols/qr-encoder.protocol';
import type { QueuePlaceStoreProtocol } from '@core/protocols/queue-place-store.protocol';
import type { SnapProtocol } from '@core/protocols/snap.protocol';
import type { StorageProtocol } from '@core/protocols/storage.protocol';
import type { TokenStoreProtocol } from '@core/protocols/token-store.protocol';
import type { TurnstileProtocol } from '@core/protocols/turnstile.protocol';
import type { AccountServiceInterface } from '@core/services/account.service';
import type { AuthServiceInterface } from '@core/services/auth.service';
import type { BookingServiceInterface } from '@core/services/booking.service';
import type { CatalogServiceInterface } from '@core/services/catalog.service';
import type { DeviceServiceInterface } from '@core/services/device.service';
import type { QueueServiceInterface } from '@core/services/queue.service';
import type { SignOutUseCaseInterface } from '@core/use_case/auth/sign-out.use-case';
import type { RefreshSessionUseCaseInterface } from '@core/use_case/auth/refresh-session.use-case';
import type { RequestSignInCodeUseCaseInterface } from '@core/use_case/auth/request-sign-in-code.use-case';
import type { VerifySignInCodeUseCaseInterface } from '@core/use_case/auth/verify-sign-in-code.use-case';
import type { EndOrderWindowUseCaseInterface } from '@core/use_case/booking/end-order-window.use-case';
import type { GetOrderCategoriesUseCaseInterface } from '@core/use_case/booking/get-order-categories.use-case';
import type { HoldBookingUseCaseInterface } from '@core/use_case/booking/hold-booking.use-case';
import type { OrderTicketSelectionUseCaseInterface } from '@core/use_case/booking/order-ticket-selection.use-case';
import type { ValidateAttendeeUseCaseInterface } from '@core/use_case/booking/validate-attendee.use-case';
import type { GetHomeEventsUseCaseInterface } from '@core/use_case/catalog/get-home-events.use-case';
import type { PayBookingUseCaseInterface } from '@core/use_case/payment/pay-booking.use-case';
import type { ClaimTurnUseCaseInterface } from '@core/use_case/queue/claim-turn.use-case';
import type { FollowQueueUseCaseInterface } from '@core/use_case/queue/follow-queue.use-case';
import type { JoinQueueUseCaseInterface } from '@core/use_case/queue/join-queue.use-case';
import type { LeaveQueueUseCaseInterface } from '@core/use_case/queue/leave-queue.use-case';
import type { GetETicketUseCaseInterface } from '@core/use_case/ticket/get-e-ticket.use-case';
import type { GetMyOrdersUseCaseInterface } from '@core/use_case/ticket/get-my-orders.use-case';
import type { AccountControllerInterface } from '@controllers/account.controller';
import type { HomeControllerInterface } from '@controllers/home.controller';
import type { LoginControllerInterface } from '@controllers/login.controller';
import type { NotFoundControllerInterface } from '@controllers/not-found.controller';
import type { OrderControllerInterface } from '@controllers/order.controller';
import type { PaymentControllerInterface } from '@controllers/payment.controller';
import type { QueueControllerInterface } from '@controllers/queue.controller';
import type { TicketDetailControllerInterface } from '@controllers/ticket-detail.controller';
import type { TicketsControllerInterface } from '@controllers/tickets.controller';
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
  /**
   * The request's full `X-Request-ID` (NFR-09-W1): the popup shows its first 8 characters as "Kode bantuan" and copies
   * the whole ID, which finds the backend log line.
   */
  reference?: string;
}
export interface PopupErrorApi {
  openPopupError: (input: PopupErrorInput) => void;
  closePopupError: () => void;
}
export interface NetworkStatusApi {
  isOnline: boolean;
}
/** The analytics cookie choice (NFR-09-W2). */
export interface ConsentApi {
  /** NEXT_PUBLIC_ANALYTICS_ENABLED: without it there is no banner, no settings and no Privacy section. */
  enabled: boolean;
  /** null: not asked yet (or the choice is over a year old). */
  analytics: AnalyticsConsent | null;
  setAnalytics: (granted: boolean) => void;
  openSettings: () => void;
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
  deviceTokenStore: DeviceTokenStoreProtocol;
  queuePlaceStore: QueuePlaceStoreProtocol;
  consentStore: ConsentStoreProtocol;
  turnstile: TurnstileProtocol;
  analyticsAdapter: AnalyticsProtocol;
  queueHttp: HttpProtocol;
  coreHttp: HttpProtocol;
  fileSaver: FileSaverProtocol;
  printer: PrinterProtocol;
  /** Registered by the e-ticket page only (di/controllers/ticket-detail.ts): the QR library loads with that page. */
  qrEncoder: QrEncoderProtocol;
  /** Registered by the payment page only (di/controllers/payment.ts): snap.js loads with that page. */
  snap: SnapProtocol;

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
  /** True while the tab is in front (`visibilitychange`). */
  usePageVisible: () => boolean;
  useConsent: () => ConsentApi;

  // services
  accountService: AccountServiceInterface;
  authService: AuthServiceInterface;
  catalogService: CatalogServiceInterface;
  bookingService: BookingServiceInterface;
  deviceService: DeviceServiceInterface;
  queueService: QueueServiceInterface;

  // use cases
  getHomeEventsUseCase: GetHomeEventsUseCaseInterface;
  getOrderCategoriesUseCase: GetOrderCategoriesUseCaseInterface;
  orderTicketSelectionUseCase: OrderTicketSelectionUseCaseInterface;
  validateAttendeeUseCase: ValidateAttendeeUseCaseInterface;
  endOrderWindowUseCase: EndOrderWindowUseCaseInterface;
  holdBookingUseCase: HoldBookingUseCaseInterface;
  joinQueueUseCase: JoinQueueUseCaseInterface;
  followQueueUseCase: FollowQueueUseCaseInterface;
  claimTurnUseCase: ClaimTurnUseCaseInterface;
  leaveQueueUseCase: LeaveQueueUseCaseInterface;
  refreshSessionUseCase: RefreshSessionUseCaseInterface;
  signOutUseCase: SignOutUseCaseInterface;
  requestSignInCodeUseCase: RequestSignInCodeUseCaseInterface;
  verifySignInCodeUseCase: VerifySignInCodeUseCaseInterface;
  getMyOrdersUseCase: GetMyOrdersUseCaseInterface;
  getETicketUseCase: GetETicketUseCaseInterface;
  payBookingUseCase: PayBookingUseCaseInterface;

  // helpers
  ERROR_CODE_MAP: Readonly<Record<string, string>>;

  // controllers
  accountController: AccountControllerInterface;
  homeController: HomeControllerInterface;
  loginController: LoginControllerInterface;
  notFoundController: NotFoundControllerInterface;
  orderController: OrderControllerInterface;
  paymentController: PaymentControllerInterface;
  queueController: QueueControllerInterface;
  ticketDetailController: TicketDetailControllerInterface;
  ticketsController: TicketsControllerInterface;

  // services, use cases and more controllers are added here by /add-feature
}
