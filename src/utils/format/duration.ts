export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
}

const MINUTE = 60_000;

/** Splits a span into whole days, hours and minutes, rounding up to the next minute (never shows 0 while > 0). */
export function durationParts(ms: number): DurationParts {
  const total = Math.max(0, Math.ceil(ms / MINUTE));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}
