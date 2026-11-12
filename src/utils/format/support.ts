/** The first 8 characters of the request ID: short enough to read out; the popup copies the full ID. */
export const SUPPORT_CODE_LENGTH = 8;

/** "3f2a9c1e" for the error popup's "Kode bantuan" (NFR-09-W1). */
export function supportCode(requestId: string): string {
  return requestId.slice(0, SUPPORT_CODE_LENGTH);
}
