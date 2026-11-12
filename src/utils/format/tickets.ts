import type { TFunction } from 'i18next';

import type { Booking, PaymentMethod, Ticket } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import { ROUTES, withQuery } from '@utils/constants/routes';

import { DEFAULT_TIME_ZONE, formatDayMonth, formatEventDate, formatShortDateTime, formatTime, zoneAbbr } from './date';
import type { FormatLocale } from './date';
import { posterToneFor, type PosterTone } from './event-card';
import { formatRupiah } from './number';

const DAY_MS = 86_400_000;

/** Brand names stay as they are; only the card needs a translation. */
const PAYMENT_METHOD_LABEL: Record<Exclude<PaymentMethod, 'card'>, string> = {
  qris: 'QRIS',
  gopay: 'GoPay',
  shopeepay: 'ShopeePay',
  bca_va: 'BCA Virtual Account',
  mandiri_va: 'Mandiri Virtual Account',
  bni_va: 'BNI Virtual Account',
  bri_va: 'BRI Virtual Account',
  permata_va: 'Permata Virtual Account',
  cimb_va: 'CIMB Niaga Virtual Account',
};

/** '' for no method or one outside the enum: the order line then leaves it out. */
export function paymentMethodLabel(method: PaymentMethod | null | undefined, t: TFunction): string {
  if (!method) return '';
  if (method === 'card') return t('ticket_method_card');
  return Object.hasOwn(PAYMENT_METHOD_LABEL, method) ? PAYMENT_METHOD_LABEL[method] : '';
}

/** `2026-12-04` in the venue's zone, so "tomorrow" means the venue's tomorrow. */
const dayKey = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );

/** Calendar days from `now` to `startsAt` in the venue's zone: 0 today, 1 tomorrow; negative once it has passed. */
export function daysUntil(startsAt: string, now: string, timeZone = DEFAULT_TIME_ZONE): number {
  return Math.round((Date.parse(dayKey(startsAt, timeZone)) - Date.parse(dayKey(now, timeZone))) / DAY_MS);
}

/** "Hari ini" / "Besok" / "25 hari lagi"; '' once the day has passed. */
export function daysLeftLabel(days: number, t: TFunction): string {
  if (days < 0) return '';
  if (days === 0) return t('tickets_today');
  if (days === 1) return t('tickets_tomorrow');
  return t('tickets_days_left', { count: days });
}

const eventTitle = (event: EventSummary) => (event.subtitle ? `${event.name} — ${event.subtitle}` : event.name);

/** One order card on "Tiket Saya". */
export interface MyOrderCardView {
  bookingId: string;
  href: string;
  past: boolean;
  /** "Pelita — Tur Kota Lama"; the first ticket's category when the event could not be loaded. */
  title: string;
  posterTitle: string;
  posterSubtitle?: string;
  posterTone: PosterTone;
  imageUrl?: string;
  /** "Jum, 4 Des 2026 · 19.30 WIB · Lapangan Simpang Lima, Semarang"; '' without the event. */
  dateLine: string;
  /** "4" and "Des"; '' without the event. */
  day: string;
  month: string;
  /** "25 hari lagi"; '' for past orders and without the event. */
  daysLeft: string;
  /** Category over the holder's name; no NIK on the list. */
  stubs: { id: string; category: string; holder: string }[];
  /** "2 tiket", for the stub list's label. */
  ticketCount: string;
  orderCode: string;
  total: string;
}

export interface MyOrderInput {
  booking: Booking;
  event: EventSummary | null;
  tickets: Ticket[];
}

export function toMyOrderCardView(
  { booking, event, tickets }: MyOrderInput,
  { past, serverNow, locale, t }: { past: boolean; serverNow: string | null; locale: FormatLocale; t: TFunction },
): MyOrderCardView {
  const timeZone = event?.timezone ?? DEFAULT_TIME_ZONE;
  const place = event ? [event.venue, event.city].filter(Boolean).join(', ') : '';
  const days = event && serverNow && !past ? daysUntil(event.startsAt, serverNow, timeZone) : -1;
  const [day = '', month = ''] = event ? formatDayMonth(event.startsAt, locale, timeZone).split(' ') : [];
  return {
    bookingId: booking.bookingId,
    href: withQuery(ROUTES.TICKET_DETAIL, { booking: booking.bookingId }),
    past,
    title: event ? eventTitle(event) : (tickets[0]?.categoryName ?? t('tickets_unknown_event')),
    posterTitle: event?.name ?? 'RUSUH',
    posterSubtitle: event?.subtitle,
    posterTone: past ? 'ink' : posterToneFor(booking.eventId),
    imageUrl: event?.imageUrl,
    dateLine: event ? [formatEventDate(event.startsAt, locale, timeZone), place].filter(Boolean).join(' · ') : '',
    day,
    month,
    daysLeft: daysLeftLabel(days, t),
    stubs: tickets.map((ticket) => ({ id: ticket.ticketId, category: ticket.categoryName, holder: ticket.holderName })),
    ticketCount: t('tickets_count', { count: tickets.length }),
    orderCode: booking.orderCode ?? '',
    total: formatRupiah(booking.price.total.amount, locale),
  };
}

/** One stub on the e-ticket page. */
export interface TicketStubView {
  id: string;
  /** "Tiket 1/3" */
  label: string;
  posterTitle: string;
  posterTone: PosterTone;
  category: string;
  holder: string;
  nikMasked: string;
  /** "Gerbang 5 · berdiri"; '' when the API sent neither. */
  entry: string;
  /** "Sab, 12 Des · 16.00 WIB"; '' without the event. */
  doorsOpen: string;
  /** Printed under the QR; staff type it when the QR does not scan. */
  code: string;
  qrPayload: string;
}

export interface ETicketView {
  /** "Lunas · 12.07 WIB" (the time in the venue's zone), or "Lunas". */
  stamp: string;
  /** "Sampai jumpa di GBK!" */
  heading: string;
  /** "3 tiket SAMUDRA sudah atas nama pemegang NIK masing-masing." */
  lead: string;
  orderCode: string;
  total: string;
  method: string;
  stubs: TicketStubView[];
  /** For "Tambah ke kalender"; null without the event. */
  calendar: { title: string; startsAt: string; location: string } | null;
}

/** Each category its own colour: the first takes the event's tone, the next ones alternate. */
function categoryTones(tickets: Ticket[], eventTone: PosterTone): Map<string, PosterTone> {
  const other: PosterTone = eventTone === 'pink' ? 'blue' : 'pink';
  const tones = new Map<string, PosterTone>();
  for (const ticket of tickets) {
    if (!tones.has(ticket.categoryName)) tones.set(ticket.categoryName, tones.size % 2 === 0 ? eventTone : other);
  }
  return tones;
}

export function toETicketView(
  { booking, event, tickets }: MyOrderInput,
  { locale, t }: { locale: FormatLocale; t: TFunction },
): ETicketView {
  const timeZone = event?.timezone ?? DEFAULT_TIME_ZONE;
  const tones = categoryTones(tickets, posterToneFor(booking.eventId));
  const doorsAt = event?.doorsOpenAt ?? event?.startsAt;
  const place = event?.venueShort ?? event?.venue;
  const seating = (ticket: Ticket) => (ticket.seating ? t(`ticket_seating_${ticket.seating}`) : '');
  return {
    stamp: booking.paidAt
      ? `${t('ticket_paid')} · ${formatTime(booking.paidAt, locale, timeZone)} ${zoneAbbr(timeZone)}`
      : t('ticket_paid'),
    heading: place ? t('ticket_heading', { place }) : t('ticket_heading_fallback'),
    lead: t('ticket_lead', { count: tickets.length, event: (event?.name ?? '').toUpperCase() }),
    orderCode: booking.orderCode ?? '',
    total: formatRupiah(booking.price.total.amount, locale),
    method: paymentMethodLabel(booking.paymentMethod, t),
    stubs: tickets.map((ticket, index) => ({
      id: ticket.ticketId,
      label: t('ticket_stub_label', { n: index + 1, total: tickets.length }),
      posterTitle: event?.name ?? 'RUSUH',
      posterTone: tones.get(ticket.categoryName) ?? 'blue',
      category: ticket.categoryName,
      holder: ticket.holderName,
      nikMasked: ticket.nikMasked,
      entry: [ticket.entryGate, seating(ticket)].filter(Boolean).join(' · '),
      doorsOpen: doorsAt ? formatShortDateTime(doorsAt, locale, timeZone) : '',
      code: ticket.ticketCode ?? '',
      qrPayload: ticket.qrPayload,
    })),
    calendar: event
      ? {
          title: eventTitle(event),
          startsAt: event.startsAt,
          location: [event.venue, event.city].filter(Boolean).join(', '),
        }
      : null,
  };
}
