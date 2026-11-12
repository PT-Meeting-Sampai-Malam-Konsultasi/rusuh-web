// Pure contract for HTTP access. Implemented by infrastructure/adapters/http.adapter.ts.

export interface HttpResponse<T> {
  data: T;
  status: number;
}

/** Every failure, normalised. `code` is the API's stable error code (RFC 9457 Problem.code) or a transport code. */
export interface HttpError {
  status: number;
  code: string;
  message: string;
  data?: unknown;
  traceId?: string;
  /**
   * The request's `X-Request-ID` (NFR-09-W1): the server's echo when it sent one, otherwise the ID we sent. Support
   * finds the backend log line with it ("Kode bantuan"); undefined for a call sent without one (the frontier).
   */
  requestId?: string;
}

export interface RequestConfig {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Send cookies (the web's `__Host-rt` refresh cookie on the auth calls). */
  withCredentials?: boolean;
  /** Reject a 401 as it is, without refreshing the session first (the auth calls themselves). */
  skipRefresh?: boolean;
  /** 'blob' for a file (the tickets PDF); JSON otherwise. */
  responseType?: 'blob';
  /**
   * A public read cached at the CDN (the frontier, polled by every phone in a sale): sent without `X-Request-ID`, since
   * a custom header would add a CORS preflight to every poll.
   */
  cacheable?: boolean;
}

export interface HttpProtocol {
  get<T>(path: string, config?: RequestConfig): Promise<HttpResponse<T>>;
  post<T, B = unknown>(path: string, body?: B, config?: RequestConfig): Promise<HttpResponse<T>>;
  put<T, B = unknown>(path: string, body?: B, config?: RequestConfig): Promise<HttpResponse<T>>;
  patch<T, B = unknown>(path: string, body?: B, config?: RequestConfig): Promise<HttpResponse<T>>;
  delete<T>(path: string, config?: RequestConfig): Promise<HttpResponse<T>>;
}

/** Transport-level codes the HTTP adapter uses when the API gave no code of its own. */
export type TransportErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'UNKNOWN_ERROR';
