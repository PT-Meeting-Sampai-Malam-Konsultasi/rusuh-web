import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import NotFoundController from '../not-found.controller';

describe('NotFoundController', () => {
  it('returns t and the home link, and tracks the page view once', () => {
    const analyticsAdapter = { trackPageView: vi.fn(), trackEvent: vi.fn(), reportError: vi.fn() };
    const t = vi.fn((k: string) => k);
    const { result, rerender } = renderHook(() =>
      NotFoundController({ analyticsAdapter, useTranslation: (() => ({ t })) as never }),
    );
    rerender();
    expect(result.current.homeHref).toBe('/');
    expect(result.current.t('x')).toBe('x');
    expect(analyticsAdapter.trackPageView).toHaveBeenCalledTimes(1);
    expect(analyticsAdapter.trackPageView).toHaveBeenCalledWith('not_found');
  });
});
