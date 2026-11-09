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
}

export interface RequestConfig {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Send cookies (the web's `__Host-rt` refresh cookie on the auth calls). */
  withCredentials?: boolean;
  /** Reject a 401 as it is, without refreshing the session first (the auth calls themselves). */
  skipRefresh?: boolean;
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
