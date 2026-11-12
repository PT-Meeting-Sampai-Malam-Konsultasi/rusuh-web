import { useEffect, useMemo, useRef } from 'react';
import type { TFunction } from 'i18next';

import type { User } from '@core/entities/auth/auth.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { ETicketResult } from '@core/use_case/ticket/get-e-ticket.use-case';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import { ANALYTICS_EVENTS } from '@utils/analytics';
import { buildCalendarEvent, googleCalendarUrl, outlookCalendarUrl } from '@utils/calendar';
import { QUERY_KEYS } from '@utils/constants/query-keys';
import { ROUTES, withQuery } from '@utils/constants/routes';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';
import type { FormatLocale } from '@utils/format/date';
import { toETicketView, type ETicketView, type TicketStubView } from '@utils/format/tickets';
import { mainNav, type NavItem } from '@utils/navigation';

export interface TicketStub extends TicketStubView {
  /** QR modules to draw, quiet zone included. */
  qr: boolean[][];
  /** "QR tiket SMD-FB-04827" */
  qrLabel: string;
}

export type CalendarVia = 'google' | 'outlook' | 'ics';

/** "Tambah ke kalender": links that open the provider's own form, and the .ics for Apple and the rest. */
export interface CalendarMenu {
  googleUrl: string;
  outlookUrl: string;
  /** Saves `<order>.ics` (opens straight into Calendar on iPhone and Mac). */
  downloadIcs: () => void;
  /** Called when a link is picked, for analytics. */
  onPick: (via: CalendarVia) => void;
}

export interface TicketDetailControllerInterface {
  t: TFunction;
  /** 'not-paid': held, expired or cancelled; 'not-found': unknown id or someone else's booking. */
  status: 'loading' | 'ready' | 'not-paid' | 'not-found' | 'error';
  ticket: (Omit<ETicketView, 'stubs' | 'calendar'> & { stubs: TicketStub[] }) | null;
  /** The sign-in e-mail the e-tickets were sent to; '' until known. */
  email: string;
  /** "Unduh semua (PDF)": the print dialog, one ticket per A4 page; "Save as PDF" is there on every platform. */
  printTickets: () => void;
  /** Null without the event (no time or place to add). */
  calendar: CalendarMenu | null;
  /** Translated; '' unless status is 'error'. */
  errorMessage: string;
  retry: () => void;
  ticketsHref: string;
  locale: FormatLocale;
  setLocale: (locale: FormatLocale) => void;
  nav: NavItem[];
}

type TicketDetailControllerDeps = Pick<
  AwilixRegistry,
  | 'getETicketUseCase'
  | 'accountService'
  | 'qrEncoder'
  | 'fileSaver'
  | 'printer'
  | 'analyticsAdapter'
  | 'storage'
  | 'ERROR_CODE_MAP'
  | 'useTranslation'
  | 'useQueryTanstack'
  | 'useRouterNext'
  | 'useSearchParamsNext'
>;

/**
 * FR-22-W1: the e-tickets of one paid booking (`/tickets/detail?booking=…`), each with its QR. The PDF is printed from
 * this page: the API's PDF is not in v1 (Apidog: NON-V1, LLD-02).
 */
const TicketDetailController = ({
  getETicketUseCase,
  accountService,
  qrEncoder,
  fileSaver,
  printer,
  analyticsAdapter,
  storage,
  ERROR_CODE_MAP,
  useTranslation,
  useQueryTanstack,
  useRouterNext,
  useSearchParamsNext,
}: TicketDetailControllerDeps): TicketDetailControllerInterface => {
  const { t, i18n } = useTranslation();
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'id';
  const router = useRouterNext();
  const bookingId = useSearchParamsNext().get('booking')?.trim() ?? '';
  const signInHere = withQuery(ROUTES.LOGIN, { next: withQuery(ROUTES.TICKET_DETAIL, { booking: bookingId }) });

  useEffect(() => {
    analyticsAdapter.trackPageView('ticket_detail');
  }, [analyticsAdapter]);

  const ticketQuery = useQueryTanstack<ETicketResult, HttpError>({
    queryKey: [QUERY_KEYS.BOOKING, bookingId],
    queryFn: () => getETicketUseCase.execute(bookingId),
    enabled: bookingId !== '',
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Only for "we e-mailed them to …"; the page works without it.
  const meQuery = useQueryTanstack<User, HttpError>({
    queryKey: [QUERY_KEYS.ME],
    queryFn: async () => (await accountService.getMe()).data,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const signedOut = ticketQuery.error?.status === 401;
  useEffect(() => {
    if (signedOut) router.replace(signInHere);
  }, [signedOut, router, signInHere]);

  const result = ticketQuery.data;
  const paid = result?.kind === 'paid' ? result : null;
  const view = useMemo(() => (paid ? toETicketView(paid, { locale, t }) : null), [paid, locale, t]);
  const stubs = useMemo(
    () =>
      view?.stubs.map((stub) => ({
        ...stub,
        qr: qrEncoder.encode(stub.qrPayload),
        qrLabel: t('ticket_qr_label', { code: stub.code }),
      })) ?? [],
    [view, qrEncoder, t],
  );

  // Tracking plan §2 step 13, once per booking shown.
  const viewTrackedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!paid || viewTrackedFor.current === paid.booking.bookingId) return;
    viewTrackedFor.current = paid.booking.bookingId;
    analyticsAdapter.trackEvent(ANALYTICS_EVENTS.VIEW_TICKET, {
      event_id: paid.booking.eventId,
      booking_id: paid.booking.bookingId,
      ticket_count: paid.tickets.length,
    });
  }, [paid, analyticsAdapter]);

  // Tracking plan §4: the web saves the PDF through the print dialog.
  const printTickets = () => {
    analyticsAdapter.trackEvent(ANALYTICS_EVENTS.TICKET_DOWNLOAD, { booking_id: bookingId, method: 'pdf_print' });
    printer.print();
  };

  const calendar = useMemo((): CalendarMenu | null => {
    const event = view?.calendar;
    if (!paid || !event) return null;
    const name = paid.booking.orderCode ?? bookingId;
    // Links leave the site: event, time, place and the KTP reminder only, never the order code or names.
    const link = { ...event, description: t('ticket_calendar_link_note') };
    const picked = (via: CalendarVia) =>
      analyticsAdapter.trackEvent(ANALYTICS_EVENTS.TICKET_ADD_CALENDAR, { booking_id: bookingId, via });
    return {
      googleUrl: googleCalendarUrl(link),
      outlookUrl: outlookCalendarUrl(link),
      downloadIcs: () => {
        const ics = buildCalendarEvent({
          ...event,
          uid: `${bookingId}@rusuh-tiket.web.id`,
          description: t('ticket_calendar_note', { code: name }),
          stamp: paid.booking.serverNow,
        });
        fileSaver.save(ics, `${name}.ics`, 'text/calendar');
        picked('ics');
      },
      onPick: picked,
    };
  }, [paid, view, bookingId, t, fileSaver, analyticsAdapter]);

  let status: TicketDetailControllerInterface['status'] = 'loading';
  if (bookingId === '' || result?.kind === 'not-found') status = 'not-found';
  else if (ticketQuery.isError && !signedOut) status = 'error';
  else if (result?.kind === 'not-paid') status = 'not-paid';
  else if (paid) status = 'ready';
  const errorKey = ticketQuery.error?.code;

  return {
    t,
    status,
    ticket: view ? { ...view, stubs } : null,
    email: meQuery.data?.email ?? '',
    printTickets,
    calendar,
    errorMessage: status === 'error' && errorKey ? t(ERROR_CODE_MAP[errorKey] ?? ERROR_CODE_MAP.UNKNOWN_ERROR) : '',
    retry: () => {
      void ticketQuery.refetch();
    },
    ticketsHref: ROUTES.TICKETS,
    locale,
    setLocale: (next) => {
      storage.set(STORAGE_KEYS.LANGUAGE, next);
      void i18n.changeLanguage(next);
    },
    nav: mainNav(t, 'tickets'),
  };
};

export default TicketDetailController;
