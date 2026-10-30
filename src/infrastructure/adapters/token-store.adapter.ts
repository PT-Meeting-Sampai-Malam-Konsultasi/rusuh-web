import type { TokenStoreProtocol } from '@core/protocols/token-store.protocol';

/** Keeps the short-lived access token in memory only (never in storage). The sign-in feature sets it. */
export function createTokenStore(): TokenStoreProtocol {
  let token: string | null = null;
  return {
    getAccessToken: () => token,
    setAccessToken: (next) => {
      token = next;
    },
  };
}
