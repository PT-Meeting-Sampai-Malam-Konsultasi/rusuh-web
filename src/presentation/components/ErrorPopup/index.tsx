'use client';

import { useEffect, useRef, useState } from 'react';

import Button from '@presentation/components/Button';

import styles from './error-popup.module.css';

interface ErrorPopupProps {
  open: boolean;
  title?: string;
  message: string;
  closeLabel: string;
  /**
   * "Kode bantuan: 3f2a9c1e" (translated), the full request ID it copies, and the copy button's labels; nothing when
   * the error has no request ID.
   */
  reference?: { label: string; value: string; copyLabel: string; copiedLabel: string };
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
}

/** One error at a time: a sheet on phones, a dialog on desktop. Escape or the close button dismisses it. */
export default function ErrorPopup({
  open,
  title,
  message,
  closeLabel,
  reference,
  actionLabel,
  onAction,
  onClose,
}: ErrorPopupProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const copied = !!reference && copiedValue === reference.value;

  // "Tersalin" shows for a moment, then the button reads as before.
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopiedValue(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference.value);
      setCopiedValue(reference.value);
    } catch {
      // No clipboard (an old browser, a blocked permission): the code stays on screen to read out.
    }
  };

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={styles.scrim}>
      <div
        className={styles.sheet}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={title ? 'error-popup-title' : undefined}
        aria-describedby="error-popup-message"
      >
        {title && (
          <h2 id="error-popup-title" className={styles.title}>
            {title}
          </h2>
        )}
        <p id="error-popup-message" className={styles.message}>
          {message}
        </p>
        {reference && (
          <p className={styles.reference}>
            <button
              type="button"
              className={styles.copy}
              onClick={() => void copy()}
              aria-label={`${reference.label}. ${reference.copyLabel}`}
            >
              <span className={styles.code}>{reference.label}</span>
              <span className={styles.hint} aria-live="polite">
                {copied ? `✓ ${reference.copiedLabel}` : reference.copyLabel}
              </span>
            </button>
          </p>
        )}
        <div className={styles.actions}>
          {actionLabel && onAction && (
            <Button
              onClick={() => {
                onAction();
                onClose();
              }}
            >
              {actionLabel}
            </Button>
          )}
          <Button ref={closeRef} variant={actionLabel ? 'secondary' : 'primary'} onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
