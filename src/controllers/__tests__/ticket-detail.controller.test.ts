import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TicketDetailController from '../ticket-detail.controller';

interface QueryState {
  data?: unknown;
  isError?: boolean;
  error?: { status: number; code: string; message: string } | null;
}

const money = (amount: number) => ({ amount, currency: 'IDR' as const });
const PAID = {
  kind: 'paid',
  booking: {
    bookingId: 'bk_1',
    eventId: 'evt_samudra',
    status: 'PAID',
    orderCode: 'RSH-26-084731',
    price: { lines: [], ticketSubtotal: money(0), adminFee: money(0), total: money(2180000) },
    paidAt: '2026-11-12T05:07:00Z',
    paymentMethod: 'qris',
    createdAt: '2026-11-12T05:00:00Z',
    serverNow: '2026-11-12T05:10:00Z',
  },
  event: {
    eventId: 'evt_samudra',
    name: 'Samudra',
    venue: 'Stadion Utama GBK',
    venueShort: 'GBK',
    city: 'Jakarta',
    startsAt: '2026-12-12T12:00:00Z',
    state: 'on_sale',
  },
  tickets: [
    {
      ticketId: 't1',
      ticketCode: 'SMD-FB-04827',
      bookingId: 'bk_1',
      categoryName: 'Festival B',
      holderName: 'Nadia',
      nikMasked: 'x',
      qrPayload: 'RSH1.a',
    },
  ],
};

describe('TicketDetailController', () => {
  const queries: Record<string, Record<string, unknown>> = {};
  let ticketState: QueryState;
  let meState: QueryState;
  let params: URLSearchParams;
  const refetch = vi.fn();
  const router = { replace: vi.fn(), push: vi.fn() };
  const changeLanguage = vi.fn();
  const i18n = { language: 'id', changeLanguage };
  const t = vi.fn((key: string) => key);

  const deps = () => ({
    getETicketUseCase: { execute: vi.fn().mockResolvedValue(PAID) },
    accountService: { getMe: vi.fn().mockResolvedValue({ data: { email: 'nadia@x.id' }, status: 200 }) },
    qrEncoder: { encode: vi.fn(() => [[true]]) },
    fileSaver: { save: vi.fn() },
    printer: { print: vi.fn() },
    analyticsAdapter: { trackPageView: vi.fn(), trackEvent: vi.fn(), reportError: vi.fn() },
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    ERROR_CODE_MAP: { INTERNAL_ERROR: 'error_internal', UNKNOWN_ERROR: 'error_unknown_error' },
    useTranslation: () => ({ t, i18n }),
    useQueryTanstack: (options: Record<string, unknown>) => {
      const key = (options.queryKey as string[])[0];
      queries[key] = options;
      const state = key === 'me' ? meState : ticketState;
      return { data: undefined, isError: false, error: null, refetch, ...state };
    },
    useRouterNext: () => router,
    useSearchParamsNext: () => params,
  });
  const render = (d = deps()) => renderHook(() => TicketDetailController(d as never));
  const SIGN_IN = '/login?next=%2Ftickets%2Fdetail%3Fbooking%3Dbk_1';

  beforeEach(() => {
    vi.clearAllMocks();
    ticketState = {};
    meState = {};
    params = new URLSearchParams('booking=bk_1');
    i18n.language = 'id';
  });

  it('loads the booking from ?booking= and the e-mail, and tracks the page', async () => {
    const d = deps();
    const { result } = render(d);
    expect(result.current.status).toBe('loading');
    expect(queries.booking).toMatchObject({ queryKey: ['booking', 'bk_1'], enabled: true, retry: false });
    await (queries.booking.queryFn as () => Promise<unknown>)();
    expect(d.getETicketUseCase.execute).toHaveBeenCalledWith('bk_1');
    await expect((queries.me.queryFn as () => Promise<unknown>)()).resolves.toEqual({ email: 'nadia@x.id' });
    expect(d.analyticsAdapter.trackPageView).toHaveBeenCalledWith('ticket_detail');
    expect(result.current.nav.find((item) => item.current)?.icon).toBe('tickets');
  });

  it('shows a paid booking with a QR per ticket and the e-mail', () => {
    const d = deps();
    ticketState = { data: PAID };
    meState = { data: { email: 'nadia@x.id' } };
    const { result } = render(d);
    expect(result.current.status).toBe('ready');
    expect(result.current.email).toBe('nadia@x.id');
    expect(result.current.ticket).toMatchObject({ orderCode: 'RSH-26-084731', method: 'QRIS' });
    expect(result.current.ticket?.stubs[0]).toMatchObject({
      qr: [[true]],
      qrLabel: 'ticket_qr_label',
      code: 'SMD-FB-04827',
    });
    expect(d.qrEncoder.encode).toHaveBeenCalledWith('RSH1.a');
  });

  it('says not found without a booking id or for an unknown one, and not paid for the rest', () => {
    params = new URLSearchParams('');
    const empty = render();
    expect(empty.result.current.status).toBe('not-found');
    expect(queries.booking.enabled).toBe(false);
    params = new URLSearchParams('booking=bk_1');
    ticketState = { data: { kind: 'not-found' } };
    expect(render().result.current.status).toBe('not-found');
    ticketState = { data: { kind: 'not-paid', status: 'EXPIRED', eventId: 'evt_samudra' } };
    expect(render().result.current).toMatchObject({ status: 'not-paid', ticket: null });
  });

  it('sends a signed-out visitor to sign in, back here, and shows other failures with a retry', () => {
    ticketState = { isError: true, error: { status: 401, code: 'UNAUTHORIZED', message: 'x' } };
    expect(render().result.current.status).toBe('loading');
    expect(router.replace).toHaveBeenCalledWith(SIGN_IN);

    ticketState = { isError: true, error: { status: 503, code: 'INTERNAL_ERROR', message: 'x' } };
    const { result } = render();
    expect(result.current).toMatchObject({ status: 'error', errorMessage: 'error_internal' });
    result.current.retry();
    expect(refetch).toHaveBeenCalled();
    ticketState = { isError: true, error: { status: 0, code: 'ODD', message: 'x' } };
    expect(render().result.current.errorMessage).toBe('error_unknown_error');
  });

  it('prints the tickets to PDF through the print dialog', () => {
    const d = deps();
    ticketState = { data: PAID };
    const { result } = render(d);
    result.current.printTickets();
    expect(d.printer.print).toHaveBeenCalledTimes(1);
    expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('ticket_pdf_printed', { tickets: 1 });
  });

  it('offers Google and Outlook links without the order code, and an .ics named after the order', () => {
    const d = deps();
    ticketState = { data: PAID };
    const { result } = render(d);
    const calendar = result.current.calendar!;
    const google = new URL(calendar.googleUrl);
    expect(google.hostname).toBe('calendar.google.com');
    expect(google.searchParams.get('dates')).toBe('20261212T120000Z/20261212T160000Z');
    expect(google.searchParams.get('details')).toBe('ticket_calendar_link_note');
    expect(new URL(calendar.outlookUrl).searchParams.get('subject')).toBe('Samudra');
    expect(calendar.googleUrl + calendar.outlookUrl).not.toContain('RSH-26-084731');
    calendar.onPick('google');
    expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('ticket_calendar_added', { via: 'google' });

    act(() => calendar.downloadIcs());
    const [ics, name, type] = d.fileSaver.save.mock.calls[0] as unknown as [string, string, string];
    expect(name).toBe('RSH-26-084731.ics');
    expect(type).toBe('text/calendar');
    expect(ics).toContain('UID:bk_1@rusuh-tiket.web.id');
    expect(ics).toContain('DTSTART:20261212T120000Z');
    expect(ics).toContain('DESCRIPTION:ticket_calendar_note');
    expect(d.analyticsAdapter.trackEvent).toHaveBeenCalledWith('ticket_calendar_added', { via: 'ics' });
  });

  it('has no calendar without the event or before the booking loads, and names the .ics by booking id without an order code', () => {
    const d = deps();
    expect(render(d).result.current.calendar).toBeNull();
    ticketState = { data: { ...PAID, event: null } };
    expect(render(d).result.current.calendar).toBeNull();
    ticketState = { data: { ...PAID, booking: { ...PAID.booking, orderCode: undefined } } };
    const unnamed = render(d).result.current.calendar!;
    act(() => unnamed.downloadIcs());
    expect(d.fileSaver.save.mock.calls[0][1]).toBe('bk_1.ics');
  });

  it('switches language and remembers it', () => {
    const d = deps();
    const { result } = render(d);
    result.current.setLocale('en');
    expect(d.storage.set).toHaveBeenCalledWith('rusuh.lang', 'en');
    expect(changeLanguage).toHaveBeenCalledWith('en');
  });
});
