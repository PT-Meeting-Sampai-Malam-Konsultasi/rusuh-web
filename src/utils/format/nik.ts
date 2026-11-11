/** How many digits stay visible at each end of a masked NIK (design system: first 4 + last 4). */
const NIK_VISIBLE_EDGE = 4;
const NIK_GROUP = 4;
const NIK_MASK_CHAR = '•';

/** Keeps digits only: what the NIK field stores. No length or structure rule (FR-15-W1). */
export function toNikDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Digits grouped by 4; every digit except the first 4 and the last 4 becomes "•" (design-system "NIK masked as first
 * 4 + last 4"). '3174055203960004' → '3174 •••• •••• 0004'; 8 digits or fewer stay visible ('3174 0552'); '' → ''.
 */
export function maskNik(digits: string): string {
  const clean = toNikDigits(digits);
  const lastVisibleFrom = clean.length - NIK_VISIBLE_EDGE;
  const masked = Array.from(clean, (digit, i) =>
    i < NIK_VISIBLE_EDGE || i >= lastVisibleFrom ? digit : NIK_MASK_CHAR,
  ).join('');
  return masked.match(new RegExp(`.{1,${NIK_GROUP}}`, 'gu'))?.join(' ') ?? '';
}
