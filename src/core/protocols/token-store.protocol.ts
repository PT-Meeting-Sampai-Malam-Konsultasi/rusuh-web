// Pure contract for the in-memory session access token (filled by the sign-in feature).

export interface TokenStoreProtocol {
  getAccessToken(): string | null;
  setAccessToken(token: string | null): void;
}
