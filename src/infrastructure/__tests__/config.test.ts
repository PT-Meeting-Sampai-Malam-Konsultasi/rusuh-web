import { describe, expect, it } from 'vitest';

import { boolEnv, createConfig, optionalEnv, rateEnv, requireEnv, type RawEnv } from '../config';

const env: RawEnv = {
  appVersion: '0.1.0',
  queueApiUrl: 'https://q',
  coreApiUrl: 'https://c',
  apiTimeoutMs: undefined,
  midtransClientKey: 'SB-key',
  midtransSnapUrl: 'https://snap',
  turnstileEnabled: undefined,
  turnstileSiteKey: 'site',
  defaultLocale: undefined,
  apiMock: undefined,
  sentryDsn: undefined,
  sentryEnvironment: undefined,
  sentryTracesSampleRate: undefined,
  sentryReplayOnErrorRate: undefined,
  requestIdHeader: undefined,
  analyticsEnabled: undefined,
};

describe('config', () => {
  it('builds the config with defaults', () => {
    expect(createConfig(env)).toMatchObject({ apiTimeoutMs: 10000, defaultLocale: 'id', coreApiUrl: 'https://c' });
  });

  it('accepts en and a custom timeout; rejects a bad timeout', () => {
    expect(createConfig({ ...env, defaultLocale: 'en', apiTimeoutMs: '5000' })).toMatchObject({
      defaultLocale: 'en',
      apiTimeoutMs: 5000,
    });
    expect(createConfig({ ...env, apiTimeoutMs: 'abc' }).apiTimeoutMs).toBe(10000);
  });

  it('turns the API mock on only when asked', () => {
    expect(createConfig(env).apiMock).toBe(false);
    expect(createConfig({ ...env, apiMock: 'true' }).apiMock).toBe(true);
  });

  it('keeps Sentry off without a DSN, with low sample rates by default', () => {
    expect(createConfig(env)).toMatchObject({
      sentryDsn: '',
      sentryEnvironment: 'development',
      sentryTracesSampleRate: 0.05,
      sentryReplayOnErrorRate: 0.1,
    });
    expect(
      createConfig({
        ...env,
        sentryDsn: 'https://k@o1.ingest.sentry.io/2',
        sentryEnvironment: 'staging',
        sentryTracesSampleRate: '1',
        sentryReplayOnErrorRate: '0',
      }),
    ).toMatchObject({ sentryEnvironment: 'staging', sentryTracesSampleRate: 1, sentryReplayOnErrorRate: 0 });
  });

  it('sends no request ID header unless switched on', () => {
    expect(createConfig(env).requestIdHeader).toBe(false);
    expect(createConfig({ ...env, requestIdHeader: 'true' }).requestIdHeader).toBe(true);
  });

  it('keeps Turnstile off unless switched on, and needs the site key only when on', () => {
    expect(createConfig({ ...env, turnstileSiteKey: undefined })).toMatchObject({
      turnstileEnabled: false,
      turnstileSiteKey: '',
    });
    expect(createConfig({ ...env, turnstileEnabled: 'true' })).toMatchObject({
      turnstileEnabled: true,
      turnstileSiteKey: 'site',
    });
    expect(() => createConfig({ ...env, turnstileEnabled: 'true', turnstileSiteKey: undefined })).toThrow(
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    );
  });

  it('keeps product analytics off unless switched on', () => {
    expect(createConfig(env).analyticsEnabled).toBe(false);
    expect(createConfig({ ...env, analyticsEnabled: 'true' }).analyticsEnabled).toBe(true);
    expect(createConfig({ ...env, analyticsEnabled: 'false' }).analyticsEnabled).toBe(false);
  });

  it('accepts sample rates between 0 and 1 only', () => {
    expect(rateEnv('0.25', 0.05)).toBe(0.25);
    expect(rateEnv('1.5', 0.05)).toBe(0.05);
    expect(rateEnv('-1', 0.05)).toBe(0.05);
    expect(rateEnv('abc', 0.05)).toBe(0.05);
    expect(rateEnv('', 0.05)).toBe(0.05);
  });

  it('fails fast on a missing required variable', () => {
    expect(() => createConfig({ ...env, coreApiUrl: undefined })).toThrow('NEXT_PUBLIC_CORE_API_URL');
  });

  it('has small helpers', () => {
    expect(requireEnv('x', 'N')).toBe('x');
    expect(optionalEnv(undefined, 'd')).toBe('d');
    expect(boolEnv('true')).toBe(true);
    expect(boolEnv('1')).toBe(true);
    expect(boolEnv('no')).toBe(false);
    expect(boolEnv(undefined, true)).toBe(true);
  });

  it('reads the environment by default', () => {
    expect(() => createConfig()).toThrow('Missing environment variable');
  });
});
