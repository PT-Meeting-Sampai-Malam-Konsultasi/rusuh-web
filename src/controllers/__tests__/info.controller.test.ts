import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import InfoController from '../info.controller';

describe('InfoController', () => {
  const analyticsAdapter = { trackPageView: vi.fn(), trackEvent: vi.fn(), reportError: vi.fn(), setUser: vi.fn() };
  const storage = { get: vi.fn(), set: vi.fn(), remove: vi.fn() };
  const changeLanguage = vi.fn();
  const i18n = { language: 'id', changeLanguage };
  const t = vi.fn((key: string, params?: Record<string, unknown>) =>
    key.endsWith('_body') ? `${key} line 1\n${key} line 2` : params ? `${key}:${JSON.stringify(params)}` : key,
  );
  let pathname: string | null;

  const render = () =>
    renderHook(() =>
      InfoController({
        analyticsAdapter,
        storage,
        useTranslation: (() => ({ t, i18n })) as never,
        usePathnameNext: (() => pathname) as never,
      }),
    );

  beforeEach(() => {
    vi.clearAllMocks();
    pathname = '/privacy';
    i18n.language = 'id';
  });

  it('picks the topic from the path and tracks its page view once', () => {
    const { result, rerender } = render();
    rerender();
    expect(result.current.topic).toBe('privacy');
    expect(result.current.title).toBe('info_privacy_title');
    expect(result.current.lead).toBe('info_privacy_lead:{"email":"bantuan@rusuh-tiket.web.id"}');
    expect(result.current.updated).toBe('info_updated');
    expect(analyticsAdapter.trackPageView).toHaveBeenCalledTimes(1);
    expect(analyticsAdapter.trackPageView).toHaveBeenCalledWith('info_privacy');
  });

  it.each([
    ['/terms', 'terms', 7],
    ['/privacy/', 'privacy', 6],
    ['/refund', 'refund', 4],
    ['/help', 'help', 6],
  ] as const)('builds the sections of %s', (path, topic, count) => {
    pathname = path;
    const { result } = render();
    expect(result.current.topic).toBe(topic);
    expect(result.current.sections).toHaveLength(count);
    expect(result.current.sections[0]).toEqual({
      id: `${topic}-1`,
      title: `info_${topic}_1_title`,
      paragraphs: [`info_${topic}_1_body line 1`, `info_${topic}_1_body line 2`],
    });
    expect(t).toHaveBeenCalledWith(`info_${topic}_1_body`, { email: 'bantuan@rusuh-tiket.web.id' });
  });

  it('falls back to help for an unknown path', () => {
    pathname = null;
    expect(render().result.current.topic).toBe('help');
  });

  it('lists the four pages and marks the open one', () => {
    expect(render().result.current.links).toEqual([
      { href: '/terms', label: 'info_terms_title', current: false },
      { href: '/privacy', label: 'info_privacy_title', current: true },
      { href: '/refund', label: 'info_refund_title', current: false },
      { href: '/help', label: 'info_help_title', current: false },
    ]);
  });

  it('gives the help address, the main navigation with no section open, and switches language', () => {
    const { result } = render();
    expect(result.current.contactEmail).toBe('bantuan@rusuh-tiket.web.id');
    expect(result.current.nav.map((item) => item.href)).toEqual(['/', '/queue', '/tickets', '/account']);
    expect(result.current.nav.some((item) => item.current)).toBe(false);
    expect(result.current.locale).toBe('id');
    result.current.setLocale('en');
    expect(storage.set).toHaveBeenCalledWith('rusuh.lang', 'en');
    expect(changeLanguage).toHaveBeenCalledWith('en');
  });

  it('reports English as en', () => {
    i18n.language = 'en';
    expect(render().result.current.locale).toBe('en');
  });
});
