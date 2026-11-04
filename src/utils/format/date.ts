// Dates and times as the design brief writes them, always in the venue's time zone:
// ID `Sab, 12 Des 2026 · 19.00 WIB`, EN `Sat, 12 Dec 2026 · 7.00 pm WIB`.

export type FormatLocale = 'id' | 'en';

export const DEFAULT_TIME_ZONE = 'Asia/Jakarta';

const INTL_LOCALE: Record<FormatLocale, string> = { id: 'id-ID', en: 'en-GB' };

/** Indonesian zone names; anything else falls back to the short name Intl gives. */
const ZONE_ABBR: Record<string, string> = {
  'Asia/Jakarta': 'WIB',
  'Asia/Pontianak': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
};

export function zoneAbbr(timeZone: string = DEFAULT_TIME_ZONE): string {
  if (ZONE_ABBR[timeZone]) return ZONE_ABBR[timeZone];
  const part = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' })
    .formatToParts(new Date(0))
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? timeZone;
}

const parts = (iso: string, locale: FormatLocale, timeZone: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone, ...options }).format(new Date(iso));

/** `19.00` (ID) or `7.00 pm` (EN). */
export function formatTime(iso: string, locale: FormatLocale, timeZone = DEFAULT_TIME_ZONE): string {
  if (locale === 'id') {
    return parts(iso, locale, timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).replace(':', '.');
  }
  return parts(iso, locale, timeZone, { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(':', '.')
    .replace(/\s?([ap])\.?m\.?/i, ' $1m')
    .toLowerCase();
}

/** `Sab, 12 Des 2026 · 19.00 WIB` */
export function formatEventDate(iso: string, locale: FormatLocale, timeZone = DEFAULT_TIME_ZONE): string {
  const day = parts(iso, locale, timeZone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return `${day.replace(/^(\w+)\s/, '$1, ')} · ${formatTime(iso, locale, timeZone)} ${zoneAbbr(timeZone)}`;
}

/** `Jum, 30 Okt · 10.00 WIB` (no year: used for openings in the next weeks). */
export function formatShortDateTime(iso: string, locale: FormatLocale, timeZone = DEFAULT_TIME_ZONE): string {
  const day = parts(iso, locale, timeZone, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day.replace(/^(\w+)\s/, '$1, ')} · ${formatTime(iso, locale, timeZone)} ${zoneAbbr(timeZone)}`;
}

/** `29 Okt` */
export function formatDayMonth(iso: string, locale: FormatLocale, timeZone = DEFAULT_TIME_ZONE): string {
  return parts(iso, locale, timeZone, { day: 'numeric', month: 'short' });
}

/** `12.12.26`, the poster date. */
export function formatPosterDate(iso: string, timeZone = DEFAULT_TIME_ZONE): string {
  return parts(iso, 'id', timeZone, { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.');
}
