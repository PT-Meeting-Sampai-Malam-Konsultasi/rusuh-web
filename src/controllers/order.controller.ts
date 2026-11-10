import { useEffect, useMemo, useRef } from 'react';
import type { TFunction } from 'i18next';

import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { OrderCategoriesResult } from '@core/use_case/booking/get-order-categories.use-case';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import type { FormatLocale } from '@utils/format/date';
import {
  toOrderCategoryView,
  toOrderEventView,
  type OrderCategoryView,
  type OrderEventView,
} from '@utils/format/order-event';
import { retryTransientOnce } from '@utils/query/retry';
import { QUERY_KEYS } from '@utils/constants/query-keys';
import { ROUTES, withQuery } from '@utils/constants/routes';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';

export type OrderStatus = 'loading' | 'error' | 'not-found' | 'ready';

export interface FlowStep {
  number: 1 | 2 | 3;
  label: string;
  current: boolean;
}

export interface OrderControllerInterface {
  t: TFunction;
  status: OrderStatus;
  /** Null until the event loads, and in the not-found state. */
  event: OrderEventView | null;
  /** Server order; empty until the categories load. */
  categories: OrderCategoryView[];
  /** "Maks. 3 tiket per transaksi. Tanpa nomor kursi — masuk sesuai kategori."; '' until loaded. */
  categoryNote: string;
  /** Translated; '' unless status is 'error'. */
  errorMessage: string;
  /** Refetches every failed query. */
  retry: () => void;
  steps: FlowStep[];
  /** /queue?event=<id>, or Home without an event id. */
  backHref: string;
  homeHref: string;
  locale: FormatLocale;
  setLocale: (locale: FormatLocale) => void;
}

type OrderControllerDeps = Pick<
  AwilixRegistry,
  | 'catalogService'
  | 'getOrderCategoriesUseCase'
  | 'admissionStore'
  | 'analyticsAdapter'
  | 'storage'
  | 'ERROR_CODE_MAP'
  | 'useTranslation'
  | 'useQueryTanstack'
  | 'useRouterNext'
  | 'useSearchParamsNext'
>;

/** The event header barely changes during a sale. */
const EVENT_STALE_MS = 60_000;

const OrderController = ({
  catalogService,
  getOrderCategoriesUseCase,
  admissionStore,
  analyticsAdapter,
  storage,
  ERROR_CODE_MAP,
  useTranslation,
  useQueryTanstack,
  useRouterNext,
  useSearchParamsNext,
}: OrderControllerDeps): OrderControllerInterface => {
  const { t, i18n } = useTranslation();
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'id';
  const router = useRouterNext();
  const searchParams = useSearchParamsNext();
  const eventId = searchParams.get('event')?.trim() ?? '';
  const hasEventId = eventId !== '';

  useEffect(() => {
    analyticsAdapter.trackPageView('order');
  }, [analyticsAdapter]);

  const eventQuery = useQueryTanstack<EventSummary, HttpError>({
    queryKey: [QUERY_KEYS.EVENT, eventId],
    queryFn: async () => (await catalogService.getEvent(eventId)).data,
    enabled: hasEventId,
    staleTime: EVENT_STALE_MS,
    retry: retryTransientOnce,
  });

  // The token is read at fetch time and never put in the key; gcTime 0: the snapshot belongs to one admission.
  const categoriesQuery = useQueryTanstack<OrderCategoriesResult, HttpError>({
    queryKey: [QUERY_KEYS.CATEGORIES, eventId, locale],
    queryFn: () => getOrderCategoriesUseCase.execute({ eventId, admissionToken: admissionStore.get(eventId) }),
    enabled: hasEventId,
    gcTime: 0,
    retry: retryTransientOnce,
    placeholderData: (previous) => previous,
  });

  const eventData = eventQuery.data;
  const categoriesData = categoriesQuery.data;
  const eventError = eventQuery.isError ? eventQuery.error : null;
  const categoriesError = categoriesQuery.isError ? categoriesQuery.error : null;

  const eventNotFound = !!eventError && (eventError.code === 'NOT_FOUND' || eventError.status === 404);
  const shouldRedirect = !!eventData && categoriesData?.kind === 'admission-invalid';

  const redirected = useRef(false);
  useEffect(() => {
    if (!shouldRedirect || redirected.current) return;
    redirected.current = true;
    router.replace(withQuery(ROUTES.QUEUE, { event: eventId }));
  }, [shouldRedirect, router, eventId]);

  const ok = categoriesData?.kind === 'ok' ? categoriesData : null;

  let status: OrderStatus = 'loading';
  if (!hasEventId || eventNotFound) status = 'not-found';
  else if (eventError || categoriesError) status = 'error';
  else if (eventData && ok) status = 'ready';

  const event = useMemo(
    () => (eventData && !eventNotFound ? toOrderEventView(eventData, locale) : null),
    [eventData, eventNotFound, locale],
  );
  const categories = useMemo(
    () => (ok ? ok.categories.map((category) => toOrderCategoryView(category, locale, t)) : []),
    [ok, locale, t],
  );

  const errorCode = (eventError ?? categoriesError)?.code;
  const errorMessage =
    status === 'error' && errorCode ? t(ERROR_CODE_MAP[errorCode] ?? ERROR_CODE_MAP.UNKNOWN_ERROR) : '';

  const steps: FlowStep[] = [
    { number: 1, label: t('order_step_choose'), current: true },
    { number: 2, label: t('order_step_pay'), current: false },
    { number: 3, label: t('order_step_ticket'), current: false },
  ];

  return {
    t,
    status,
    event,
    categories,
    categoryNote: ok ? t('order_category_note', { count: ok.maxTicketsPerOrder }) : '',
    errorMessage,
    retry: () => {
      if (eventQuery.isError) void eventQuery.refetch();
      if (categoriesQuery.isError) void categoriesQuery.refetch();
    },
    steps,
    backHref: hasEventId ? withQuery(ROUTES.QUEUE, { event: eventId }) : ROUTES.HOME,
    homeHref: ROUTES.HOME,
    locale,
    setLocale: (next) => {
      storage.set(STORAGE_KEYS.LANGUAGE, next);
      void i18n.changeLanguage(next);
    },
  };
};

export default OrderController;
