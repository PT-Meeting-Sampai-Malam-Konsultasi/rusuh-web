'use client';

import { useEffect, useRef } from 'react';

import Button from '@presentation/components/Button';

import styles from './error-popup.module.css';

interface ErrorPopupProps {
  open: boolean;
  title?: string;
  message: string;
  closeLabel: string;
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
  actionLabel,
  onAction,
  onClose,
}: ErrorPopupProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

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
