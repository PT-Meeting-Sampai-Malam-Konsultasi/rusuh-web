import { useEffect, useMemo } from 'react';
import type { TFunction } from 'i18next';

import type { HttpError } from '@core/protocols/http.protocol';
import type { HomeEvents } from '@core/use_case/catalog/get-home-events.use-case';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import type { FormatLocale } from '@utils/format/date';
import { toEventCardView, type EventCardView } from '@utils/format/event-card';
import { QUERY_KEYS } from '@utils/constants/query-keys';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';
import { mainNav, type NavItem } from '@utils/navigation';

export type { NavItem } from '@utils/navigation';

export type HomeStatus = 'loading' | 'error' | 'empty' | 'ready';

export interface HomeControllerInterface {
  t: TFunction;
  status: HomeStatus;
  featured: EventCardView | null;
  events: EventCardView[];
  countLabel: string;
  errorMessage: string;
  retry: () => void;
  locale: FormatLocale;
  setLocale: (locale: FormatLocale) => void;
  nav: NavItem[];
  /** Under the featured call to action. */
  joinHint: string;
  /** Analytics when a join link is followed; position 0 is the featured poster, 1… the list. */
  selectEvent: (eventId: string, position: number) => void;
}

/** Home keeps stamps fresh during a sale; the CDN caches `GET /events` for 5–10 s, so this is cheap. */
const STALE_MS = 5_000;
const REFRESH_MS = 30_000;

const HomeController = ({
  getHomeEventsUseCase,
  analyticsAdapter,
  storage,
  ERROR_CODE_MAP,
  useTranslation,
  useQueryTanstack,
}: Pick<
  AwilixRegistry,
  'getHomeEventsUseCase' | 'analyticsAdapter' | 'storage' | 'ERROR_CODE_MAP' | 'useTranslation' | 'useQueryTanstack'
>): HomeControllerInterface => {
  const { t, i18n } = useTranslation();
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'id';

  useEffect(() => {
    analyticsAdapter.trackPageView('home');
  }, [analyticsAdapter]);

  const query = useQueryTanstack<HomeEvents, HttpError>({
    queryKey: [QUERY_KEYS.EVENTS],
    queryFn: () => getHomeEventsUseCase.execute(),
    staleTime: STALE_MS,
    refetchInterval: REFRESH_MS,
  });

  const { data } = query;

  const view = useMemo(() => {
    if (!data) return { featured: null, events: [] };
    const context = { t, locale, serverNow: data.serverNow };
    return {
      featured: data.featured ? toEventCardView(data.featured, context) : null,
      events: data.others.map((event) => toEventCardView(event, context)),
    };
  }, [data, t, locale]);

  let status: HomeStatus = 'ready';
  if (!data) status = query.isError ? 'error' : 'loading';
  else if (data.total === 0) status = 'empty';

  const errorCode = query.error?.code;
  const errorMessage = errorCode ? t(ERROR_CODE_MAP[errorCode] ?? ERROR_CODE_MAP.UNKNOWN_ERROR) : '';

  const nav: NavItem[] = mainNav(t, 'events');

  return {
    t,
    status,
    featured: view.featured,
    events: view.events,
    countLabel: t('home_count', { count: data?.total ?? 0 }),
    errorMessage,
    retry: () => {
      void query.refetch();
    },
    locale,
    setLocale: (next) => {
      storage.set(STORAGE_KEYS.LANGUAGE, next);
      void i18n.changeLanguage(next);
    },
    nav,
    joinHint: t('home_join_hint'),
    selectEvent: (eventId, position) => {
      const state = [view.featured, ...view.events].find((card) => card?.id === eventId)?.state ?? 'unknown';
      analyticsAdapter.trackEvent('home_event_select', { eventId, state, position });
    },
  };
};

export default HomeController;
