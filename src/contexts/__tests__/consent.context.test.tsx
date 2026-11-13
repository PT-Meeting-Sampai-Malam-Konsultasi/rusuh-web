import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnalyticsConsent } from '@core/protocols/consent-store.protocol';

import { ConsentProvider, useConsent, useConsentPrompt } from '../consent.context';

const store = (saved: AnalyticsConsent | null = null) => {
  let value = saved;
  return {
    get: vi.fn(() => value),
    set: vi.fn((choice: AnalyticsConsent) => {
      value = choice;
    }),
  };
};

const setup = (enabled: boolean, s = store()) =>
  renderHook(() => ({ api: useConsent(), prompt: useConsentPrompt() }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <ConsentProvider enabled={enabled} store={s}>
        {children}
      </ConsentProvider>
    ),
  });

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('ConsentProvider', () => {
  it('asks nothing and reads nothing while analytics is off', () => {
    const s = store('granted');
    const { result } = setup(false, s);
    expect(s.get).not.toHaveBeenCalled();
    expect(result.current.api).toMatchObject({ enabled: false, analytics: null });
    expect(result.current.prompt.bannerVisible).toBe(false);
    expect(document.documentElement.dataset.consent).toBeUndefined();
  });

  it('asks once, saves the answer and stops asking', () => {
    const s = store();
    const { result, unmount } = setup(true, s);
    expect(result.current.prompt.bannerVisible).toBe(true);
    expect(document.documentElement.dataset.consent).toBe('');
    act(() => result.current.prompt.setAnalytics(true));
    expect(s.set).toHaveBeenCalledWith('granted');
    expect(result.current.api.analytics).toBe('granted');
    expect(result.current.prompt.bannerVisible).toBe(false);
    act(() => result.current.api.setAnalytics(false));
    expect(s.set).toHaveBeenLastCalledWith('denied');
    unmount();
    expect(document.documentElement.dataset.consent).toBeUndefined();
  });

  it('keeps a saved choice without asking', () => {
    const { result } = setup(true, store('denied'));
    expect(result.current.api.analytics).toBe('denied');
    expect(result.current.prompt.bannerVisible).toBe(false);
  });

  it('opens the settings from the code or the footer link, and hides the banner meanwhile', () => {
    const { result } = setup(true);
    act(() => result.current.api.openSettings());
    expect(result.current.prompt.settingsOpen).toBe(true);
    expect(result.current.prompt.bannerVisible).toBe(false);
    act(() => result.current.prompt.closeSettings());
    expect(result.current.prompt.settingsOpen).toBe(false);

    act(() => {
      window.history.replaceState(null, '', '/account#cookie-settings');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.prompt.settingsOpen).toBe(true);
    act(() => result.current.prompt.closeSettings());
    expect(result.current.prompt.settingsOpen).toBe(false);
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/account');
  });

  it('opens the settings when the page loads with the link', () => {
    window.history.replaceState(null, '', '/#cookie-settings');
    const { result } = setup(true);
    expect(result.current.prompt.settingsOpen).toBe(true);
  });

  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useConsent())).toThrow('ConsentProvider');
  });
});
