import { useEffect } from 'react';
import type { TFunction } from 'i18next';

import type { HttpError } from '@core/protocols/http.protocol';
import type { MyOrdersResult } from '@core/use_case/ticket/get-my-orders.use-case';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import { QUERY_KEYS } from '@utils/constants/query-keys';
import { ROUTES, withQuery } from '@utils/constants/routes';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';
import type { FormatLocale } from '@utils/format/date';
import { toMyOrderCardView, type MyOrderCardView } from '@utils/format/tickets';
import { mainNav, type NavItem } from '@utils/navigation';

export interface MyOrderGroup {
  id: 'upcoming' | 'past';
  title: string;
  /** "2 pesanan · 5 tiket" */
  summary: string;
  orders: MyOrderCardView[];
}

export interface TicketsControllerInterface {
  t: TFunction;
  /** 'signed-out': no session (tickets belong to the account); 'empty': signed in, nothing paid yet. */
  status: 'loading' | 'ready' | 'empty' | 'signed-out' | 'error';
  groups: MyOrderGroup[];
  /** Translated; '' unless status is 'error'. */
  errorMessage: string;
  retry: () => void;
  /** Sign in, then back to this list. */
  signInHref: string;
  homeHref: string;
  locale: FormatLocale;
  setLocale: (locale: FormatLocale) => void;
  nav: NavItem[];
}

type TicketsControllerDeps = Pick<
  AwilixRegistry,
  'getMyOrdersUseCase' | 'analyticsAdapter' | 'storage' | 'ERROR_CODE_MAP' | 'useTranslation' | 'useQueryTanstack'
>;

/** FR-22-W1: "Tiket Saya", every paid order; upcoming ones soonest first, then past ones. */
const TicketsController = ({
  getMyOrdersUseCase,
  analyticsAdapter,
  storage,
  ERROR_CODE_MAP,
  useTranslation,
  useQueryTanstack,
}: TicketsControllerDeps): TicketsControllerInterface => {
  const { t, i18n } = useTranslation();
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'id';

  useEffect(() => {
    analyticsAdapter.trackPageView('tickets');
  }, [analyticsAdapter]);

  const ordersQuery = useQueryTanstack<MyOrdersResult, HttpError>({
    queryKey: [QUERY_KEYS.MY_ORDERS],
    queryFn: () => getMyOrdersUseCase.execute(),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const result = ordersQuery.data;
  const signedOut = ordersQuery.error?.status === 401;
  const errorKey = ordersQuery.error?.code;

  const group = (id: MyOrderGroup['id'], orders: MyOrdersResult['upcoming']): MyOrderGroup => {
    const tickets = orders.reduce((sum, order) => sum + order.tickets.length, 0);
    const summary = [t('tickets_orders_count', { count: orders.length })];
    if (id === 'upcoming') summary.push(t('tickets_count', { count: tickets }));
    return {
      id,
      title: t(id === 'upcoming' ? 'tickets_upcoming' : 'tickets_past'),
      summary: summary.join(' · '),
      orders: orders.map((order) =>
        toMyOrderCardView(order, { past: id === 'past', serverNow: result?.serverNow ?? null, locale, t }),
      ),
    };
  };

  const groups = result
    ? [group('upcoming', result.upcoming), group('past', result.past)].filter((g) => g.orders.length > 0)
    : [];

  let status: TicketsControllerInterface['status'] = 'loading';
  if (signedOut) status = 'signed-out';
  else if (ordersQuery.isError) status = 'error';
  else if (result) status = groups.length > 0 ? 'ready' : 'empty';

  return {
    t,
    status,
    groups,
    errorMessage: status === 'error' && errorKey ? t(ERROR_CODE_MAP[errorKey] ?? ERROR_CODE_MAP.UNKNOWN_ERROR) : '',
    retry: () => {
      void ordersQuery.refetch();
    },
    signInHref: withQuery(ROUTES.LOGIN, { next: ROUTES.TICKETS }),
    homeHref: ROUTES.HOME,
    locale,
    setLocale: (next) => {
      storage.set(STORAGE_KEYS.LANGUAGE, next);
      void i18n.changeLanguage(next);
    },
    nav: mainNav(t, 'tickets'),
  };
};

export default TicketsController;
