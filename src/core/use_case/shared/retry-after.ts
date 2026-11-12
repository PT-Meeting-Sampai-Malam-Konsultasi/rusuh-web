import type { HttpError } from '@core/protocols/http.protocol';

/** Seconds to wait from a 429 problem body (`retryAfterSeconds` or `retryAfter`), rounded up; null when absent. */
export function retryAfterOf(error: unknown): number | null {
  const data = (error as HttpError | null)?.data as { retryAfter?: unknown; retryAfterSeconds?: unknown } | undefined;
  const value = data?.retryAfterSeconds ?? data?.retryAfter;
  return typeof value === 'number' && value > 0 ? Math.ceil(value) : null;
}
