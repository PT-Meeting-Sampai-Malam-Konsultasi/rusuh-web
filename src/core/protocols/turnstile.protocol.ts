// Pure contract for Cloudflare Turnstile: one single-use token per call.

export interface TurnstileProtocol {
  /** Resolves a fresh token; rejects with an HttpError coded VERIFICATION_UNAVAILABLE when the check can't finish. */
  getToken(action: string): Promise<string>;
}
