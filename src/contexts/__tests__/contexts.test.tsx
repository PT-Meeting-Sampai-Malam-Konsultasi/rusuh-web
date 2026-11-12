import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoadingProvider, useLoading } from '../loading.context';
import { NetworkStatusProvider, useNetworkStatus } from '../network-status.context';
import { PopupErrorProvider, useCurrentPopupError, usePopupError } from '../popup-error.context';

describe('LoadingProvider', () => {
  it('flips on and off with toggleLoading', () => {
    const { result } = renderHook(() => useLoading(), { wrapper: LoadingProvider });
    expect(result.current.isLoading).toBe(false);
    act(() => result.current.toggleLoading());
    expect(result.current.isLoading).toBe(true);
    act(() => result.current.toggleLoading());
    expect(result.current.isLoading).toBe(false);
  });

  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useLoading())).toThrow('LoadingProvider');
  });
});

describe('PopupErrorProvider', () => {
  it('opens and closes one popup', () => {
    const { result } = renderHook(() => ({ api: usePopupError(), current: useCurrentPopupError() }), {
      wrapper: PopupErrorProvider,
    });
    expect(result.current.current.popup).toBeNull();
    act(() => result.current.api.openPopupError({ message: 'Kode salah.' }));
    expect(result.current.current.popup).toEqual({ message: 'Kode salah.' });
    act(() => result.current.current.closePopupError());
    expect(result.current.current.popup).toBeNull();
  });

  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => usePopupError())).toThrow('PopupErrorProvider');
  });
});

describe('NetworkStatusProvider', () => {
  let observerCallback: ((list: { getEntries: () => PerformanceEntry[] }) => void) | null;
  let visibility: DocumentVisibilityState;

  beforeEach(() => {
    vi.useFakeTimers();
    observerCallback = null;
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    class FakeObserver {
      static supportedEntryTypes = ['resource'];
      constructor(callback: (list: { getEntries: () => PerformanceEntry[] }) => void) {
        observerCallback = callback;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('PerformanceObserver', FakeObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <NetworkStatusProvider heartbeatMs={1000} confirmMs={300}>
      {children}
    </NetworkStatusProvider>
  );
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const answered = (status: number, name = 'https://api.rusuh-tiket.web.id/v1/core/events') =>
    act(() =>
      observerCallback?.({ getEntries: () => [{ name, responseStatus: status } as unknown as PerformanceEntry] }),
    );

  it('follows the browser online and offline events', () => {
    let online = true;
    vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
    const { result } = renderHook(() => useNetworkStatus(), { wrapper });
    online = false;
    act(() => window.dispatchEvent(new Event('offline')));
    expect(result.current.isOnline).toBe(false);
    online = true;
    act(() => window.dispatchEvent(new Event('online')));
    expect(result.current.isOnline).toBe(true);
  });

  it('goes offline only after a failed beat is confirmed by a second try', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('down')));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useNetworkStatus(), { wrapper });
    await advance(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/robots.txt', { method: 'HEAD', cache: 'no-store' });
    expect(result.current.isOnline).toBe(true);
    await advance(300);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.isOnline).toBe(false);
  });

  it('stays online through a one-off blip, and comes back when a beat succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce(new Response(null))
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(new Response(null));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useNetworkStatus(), { wrapper });
    await advance(1300);
    expect(result.current.isOnline).toBe(true);
    await advance(1000);
    expect(result.current.isOnline).toBe(false);
    await advance(1000);
    expect(result.current.isOnline).toBe(true);
  });

  it('skips the beat when another request was answered since the last one, but not for failed loads', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useNetworkStatus(), { wrapper });
    await advance(500);
    answered(200);
    await advance(500);
    expect(fetchMock).not.toHaveBeenCalled();
    answered(0);
    await advance(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The heartbeat's own answer does not count: the next beat still runs.
    answered(200, new URL('/robots.txt', window.location.href).href);
    await advance(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('marks the connection back as soon as a request is answered', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('down'))),
    );
    const { result } = renderHook(() => useNetworkStatus(), { wrapper });
    await advance(1300);
    expect(result.current.isOnline).toBe(false);
    answered(204);
    expect(result.current.isOnline).toBe(true);
  });

  it('pauses while the tab is hidden and checks at once when it comes back', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useNetworkStatus(), { wrapper });
    visibility = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await advance(5000);
    expect(fetchMock).not.toHaveBeenCalled();
    visibility = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('starts paused in a hidden tab, and stops the confirm after unmount', async () => {
    visibility = 'hidden';
    const fetchMock = vi.fn(() => Promise.reject(new Error('down')));
    vi.stubGlobal('fetch', fetchMock);
    const hidden = renderHook(() => useNetworkStatus(), { wrapper });
    await advance(3000);
    expect(fetchMock).not.toHaveBeenCalled();
    hidden.unmount();

    visibility = 'visible';
    const shown = renderHook(() => useNetworkStatus(), { wrapper });
    await advance(1000);
    shown.unmount();
    await advance(300);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('works without PerformanceObserver', async () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useNetworkStatus(), { wrapper });
    await advance(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.isOnline).toBe(true);
  });

  it('defaults to online without a provider', () => {
    vi.useRealTimers();
    render(<Probe />);
    expect(screen.getByText('online')).toBeInTheDocument();
  });
});

function Probe() {
  return <span>{useNetworkStatus().isOnline ? 'online' : 'offline'}</span>;
}
