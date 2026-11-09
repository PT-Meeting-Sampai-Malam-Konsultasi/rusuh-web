// The wait estimate (FR-09, `08-eta-estimation` §03): position over the admit speed, as a rounded range that only goes
// down. The speed comes from the frontier, so the estimate costs no extra request.

export type WaitEstimate = { kind: 'range'; low: number; high: number } | { kind: 'soon' };

/** The upper end may rise only by more than this: a real slowdown, not a wobble. */
const RISE_TOLERANCE = 1.3;

/** Steps of 1 min under 10 min, 5 min under an hour, 10 min above. */
const stepFor = (minutes: number) => (minutes < 10 ? 1 : minutes < 60 ? 5 : 10);

/** `position ÷ rateHigh` … `position ÷ rateLow` in minutes, rounded outward. Null: no estimate (no speed, no number). */
export function waitEstimate(position: number | null, rateLow?: number, rateHigh?: number): WaitEstimate | null {
  if (position === null || !rateLow || !rateHigh) return null;
  const fastest = position / rateHigh;
  const slowest = position / rateLow;
  if (slowest < 1) return { kind: 'soon' };
  const step = stepFor(slowest);
  const high = Math.ceil(slowest / step) * step;
  const low = Math.min(high, Math.max(1, Math.floor(fastest / step) * step));
  return { kind: 'range', low, high };
}

/** "Soon" is under a minute: from there, "± 1 menit" is a wobble to hold, "± 1–2 menit" a real rise. */
const upperOf = (estimate: WaitEstimate) => (estimate.kind === 'soon' ? 0.99 : estimate.high);

/** What to show now, given what was shown: a rise of 30% or less is held, since a rising estimate hurts trust. */
export function holdWaitEstimate(shown: WaitEstimate | null, next: WaitEstimate | null): WaitEstimate | null {
  if (!shown || !next) return next;
  const before = upperOf(shown);
  const after = upperOf(next);
  return after > before && after <= before * RISE_TOLERANCE ? shown : next;
}
