import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePageVisible } from '../page-visibility';

const setVisibility = (state: DocumentVisibilityState) => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('usePageVisible', () => {
  afterEach(() => vi.restoreAllMocks());

  it('follows the tab going to the background and coming back', () => {
    const { result } = renderHook(() => usePageVisible());
    expect(result.current).toBe(true);
    act(() => setVisibility('hidden'));
    expect(result.current).toBe(false);
    act(() => setVisibility('visible'));
    expect(result.current).toBe(true);
  });
});
