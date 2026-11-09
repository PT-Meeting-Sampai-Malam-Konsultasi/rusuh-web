// Position and progress of a place in the line, shared by the join and the live updates (FR-06, FR-07).

/** `seq − served`, at least 1 (the turn itself is FR-08); null before the draw. */
export function positionOf(seq: number | null, served: number | null): number | null {
  return seq !== null && served !== null ? Math.max(1, seq - served) : null;
}

/** 0–100, one decimal: how far the line moved from `joinedServed` towards `seq`. */
export function progressOf(seq: number | null, served: number | null, joinedServed: number | null): number {
  if (seq === null || served === null) return 0;
  const start = joinedServed ?? served;
  const span = seq - start;
  if (span <= 0) return 0;
  const percent = Math.min(100, Math.max(0, ((served - start) / span) * 100));
  return Math.round(percent * 10) / 10;
}
