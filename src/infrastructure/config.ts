// The only file that reads process.env. Next.js inlines NEXT_PUBLIC_* at build time and only for literal
// `process.env.NAME` references, so every variable is read by name below. All values are public: no secrets.

export interface AppConfig {
  appVersion: string;
  queueApiUrl: string;
  coreApiUrl: string;
  apiTimeoutMs: number;
  midtransClientKey: string;
  midtransSnapUrl: string;
  turnstileSiteKey: string;
  defaultLocale: 'id' | 'en';
}

export type RawEnv = Record<keyof AppConfig, string | undefined>;

export const readEnv = (): RawEnv => ({
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
  queueApiUrl: process.env.NEXT_PUBLIC_QUEUE_API_URL,
  coreApiUrl: process.env.NEXT_PUBLIC_CORE_API_URL,
  apiTimeoutMs: process.env.NEXT_PUBLIC_API_TIMEOUT_MS,
  midtransClientKey: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY,
  midtransSnapUrl: process.env.NEXT_PUBLIC_MIDTRANS_SNAP_URL,
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  defaultLocale: process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
});

export function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

export function optionalEnv(value: string | undefined, fallback: string): string {
  return value ? value : fallback;
}

export function boolEnv(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

export function createConfig(env: RawEnv = readEnv()): AppConfig {
  const timeout = Number(optionalEnv(env.apiTimeoutMs, '10000'));
  const locale = optionalEnv(env.defaultLocale, 'id');
  return {
    appVersion: requireEnv(env.appVersion, 'NEXT_PUBLIC_APP_VERSION'),
    queueApiUrl: requireEnv(env.queueApiUrl, 'NEXT_PUBLIC_QUEUE_API_URL'),
    coreApiUrl: requireEnv(env.coreApiUrl, 'NEXT_PUBLIC_CORE_API_URL'),
    apiTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 10000,
    midtransClientKey: requireEnv(env.midtransClientKey, 'NEXT_PUBLIC_MIDTRANS_CLIENT_KEY'),
    midtransSnapUrl: requireEnv(env.midtransSnapUrl, 'NEXT_PUBLIC_MIDTRANS_SNAP_URL'),
    turnstileSiteKey: requireEnv(env.turnstileSiteKey, 'NEXT_PUBLIC_TURNSTILE_SITE_KEY'),
    defaultLocale: locale === 'en' ? 'en' : 'id',
  };
}
