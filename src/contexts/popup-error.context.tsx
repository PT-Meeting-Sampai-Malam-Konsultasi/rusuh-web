'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { PopupErrorApi, PopupErrorInput } from '@infrastructure/di/registry.types';

interface PopupErrorState extends PopupErrorApi {
  popup: PopupErrorInput | null;
}

const PopupErrorContext = createContext<PopupErrorState | null>(null);

/** Holds the one error popup shown at a time. Messages arrive already translated (controllers call t()). */
export function PopupErrorProvider({ children }: { children: ReactNode }) {
  const [popup, setPopup] = useState<PopupErrorInput | null>(null);
  const openPopupError = useCallback((input: PopupErrorInput) => setPopup(input), []);
  const closePopupError = useCallback(() => setPopup(null), []);
  const value = useMemo(() => ({ popup, openPopupError, closePopupError }), [popup, openPopupError, closePopupError]);
  return <PopupErrorContext.Provider value={value}>{children}</PopupErrorContext.Provider>;
}

function usePopupErrorState(): PopupErrorState {
  const ctx = useContext(PopupErrorContext);
  if (!ctx) throw new Error('usePopupError must be used inside PopupErrorProvider');
  return ctx;
}

/** For controllers (through DI): open and close only. */
export function usePopupError(): PopupErrorApi {
  const { openPopupError, closePopupError } = usePopupErrorState();
  return { openPopupError, closePopupError };
}

/** For the app shell that renders the popup. */
export function useCurrentPopupError() {
  const { popup, closePopupError } = usePopupErrorState();
  return { popup, closePopupError };
}
