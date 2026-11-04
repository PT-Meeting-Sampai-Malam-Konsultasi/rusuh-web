import { describe, expect, it } from 'vitest';

import { boolEnv, createConfig, optionalEnv, requireEnv, type RawEnv } from '../config';

const env: RawEnv = {
  appVersion: '0.1.0',
  queueApiUrl: 'https://q',
  coreApiUrl: 'https://c',
  apiTimeoutMs: undefined,
  midtransClientKey: 'SB-key',
  midtransSnapUrl: 'https://snap',
  turnstileSiteKey: 'site',
  defaultLocale: undefined,
  apiMock: undefined,
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
