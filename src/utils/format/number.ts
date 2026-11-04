import type { FormatLocale } from './date';

const INTL_LOCALE: Record<FormatLocale, string> = { id: 'id-ID', en: 'en-GB' };

/** `1.248` (ID) or `1,248` (EN). */
export function formatCount(value: number, locale: FormatLocale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { maximumFractionDigits: 0 }).format(value);
}

/** `Rp 2.180.000` (ID) or `Rp 2,180,000` (EN); amounts are whole rupiah. */
export function formatRupiah(amount: number, locale: FormatLocale): string {
  return `Rp ${formatCount(amount, locale)}`;
}
