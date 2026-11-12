import type { HttpError } from '@core/protocols/http.protocol';

/** The first 8 characters of the request ID: enough for support to find the log line, short enough to read out. */
export const SUPPORT_CODE_LENGTH = 8;

/** "3f2a9c1e" for the error popup's "Kode bantuan" (NFR-09-W1); undefined when the call had no request ID. */
export function supportCode(error: Pick<HttpError, 'requestId'>): string | undefined {
  return error.requestId ? error.requestId.slice(0, SUPPORT_CODE_LENGTH) : undefined;
}
