// Pure contract for handing the user a file (the tickets PDF, a calendar entry).

export interface FileSaverProtocol {
  /** Starts a download of `data` named `filename`; a string is saved as `type` (default text/plain). */
  save(data: Blob | string, filename: string, type?: string): void;
}
