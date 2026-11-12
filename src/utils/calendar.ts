// "Tambah ke kalender": one iCalendar (RFC 5545) event, opened by Google, Apple and Outlook calendars alike.

export interface CalendarEventInput {
  /** Stable per booking, so adding twice updates the same entry. */
  uid: string;
  title: string;
  /** RFC 3339; written in UTC. */
  startsAt: string;
  /** Default: four hours after the start (the API has no end time). */
  endsAt?: string;
  location?: string;
  description?: string;
  /** Server time of the response, for DTSTAMP. */
  stamp: string;
}

const DEFAULT_LENGTH_MS = 4 * 3_600_000;

/** `20261212T120000Z` */
const utc = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** Text values escape backslash, semicolon, comma and newlines. */
const text = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 octets fold onto continuation lines that start with a space. */
function fold(line: string): string {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let current = '';
  for (const char of line) {
    const limit = out.length === 0 ? 75 : 74;
    if (bytes.encode(current + char).length > limit) {
      out.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.join('\r\n ');
}

export function buildCalendarEvent(input: CalendarEventInput): string {
  const end = input.endsAt ?? new Date(Date.parse(input.startsAt) + DEFAULT_LENGTH_MS).toISOString();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rusuh//Tiket//ID',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${utc(input.stamp)}`,
    `DTSTART:${utc(input.startsAt)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${text(input.title)}`,
    ...(input.location ? [`LOCATION:${text(input.location)}`] : []),
    ...(input.description ? [`DESCRIPTION:${text(input.description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** What a calendar link may carry: it can end up in browser history and the provider's logs, so no order code or names. */
export type CalendarLinkInput = Omit<CalendarEventInput, 'uid' | 'stamp'>;

const endOf = (input: CalendarLinkInput) =>
  input.endsAt ?? new Date(Date.parse(input.startsAt) + DEFAULT_LENGTH_MS).toISOString();

/** Google Calendar's "add event" page, filled in; the buyer taps Save. No sign-in or API on our side. */
export function googleCalendarUrl(input: CalendarLinkInput): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${utc(input.startsAt)}/${utc(endOf(input))}`,
    ...(input.location ? { location: input.location } : {}),
    ...(input.description ? { details: input.description } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Outlook.com's compose page, filled in (personal accounts; work accounts get the same event from the .ics). */
export function outlookCalendarUrl(input: CalendarLinkInput): string {
  const iso = (value: string) => new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: input.title,
    startdt: iso(input.startsAt),
    enddt: iso(endOf(input)),
    ...(input.location ? { location: input.location } : {}),
    ...(input.description ? { body: input.description } : {}),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
