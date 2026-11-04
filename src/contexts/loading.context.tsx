'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { LoadingApi } from '@infrastructure/di/registry.types';

const LoadingContext = createContext<LoadingApi | null>(null);

/**
 * Global loading overlay state. Controllers call toggleLoading() in mutationFn (on) and once more in onSuccess or
 * onError (off), so every mutation flips it exactly twice.
 */
export function LoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setLoading] = useState(false);
  const toggleLoading = useCallback(() => setLoading((v) => !v), []);
  const value = useMemo(() => ({ isLoading, toggleLoading }), [isLoading, toggleLoading]);
  return <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>;
}

export function useLoading(): LoadingApi {
  const ctx = useContext(LoadingContext);
  if (!ctx) throw new Error('useLoading must be used inside LoadingProvider');
  return ctx;
}
