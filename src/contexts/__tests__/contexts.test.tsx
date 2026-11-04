import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <NetworkStatusProvider heartbeatMs={1000}>{children}</NetworkStatusProvider>
  );

  it('follows the browser online and offline events', () => {
    let online = true;
    const spy = vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
    const { result } = renderHook(() => useNetworkStatus(), { wrapper });
    online = false;
    act(() => window.dispatchEvent(new Event('offline')));
    expect(result.current.isOnline).toBe(false);
    online = true;
    act(() => window.dispatchEvent(new Event('online')));
    expect(result.current.isOnline).toBe(true);
    spy.mockRestore();
  });

  it('uses the heartbeat to detect a dead connection', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('down'))),
    );
    const { result } = renderHook(() => useNetworkStatus(), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.isOnline).toBe(false);
  });

  it('defaults to online without a provider', () => {
    render(<Probe />);
    expect(screen.getByText('online')).toBeInTheDocument();
  });
});

function Probe() {
  return <span>{useNetworkStatus().isOnline ? 'online' : 'offline'}</span>;
}
