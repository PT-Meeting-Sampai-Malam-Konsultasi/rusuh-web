import type { HttpError } from '@core/protocols/http.protocol';

/** Retry once for transport failures (status 0) and 5xx; never for 4xx (NOT_FOUND, UNAUTHORIZED, …). */
export function retryTransientOnce(failureCount: number, error: HttpError): boolean {
  if (failureCount >= 1) return false;
  return error.status === 0 || error.status >= 500;
}
