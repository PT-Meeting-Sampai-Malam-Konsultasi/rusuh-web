'use client';

import { useEffect, useRef } from 'react';
import type { TFunction } from 'i18next';

import type { QueueLeaveView } from '@controllers/queue.controller';
import Button from '@presentation/components/Button';

import styles from './queue-leave-sheet.module.css';

interface QueueLeaveSheetProps {
  t: TFunction;
  leave: QueueLeaveView;
}

/**
 * "Keluar dari antrian?" (FR-04-W2): staying is the easy choice, so "Tetap antre" is the primary button and takes the
 * focus; Escape stays too. A sheet from the bottom on phones, a dialog on desktop.
 */
export default function QueueLeaveSheet({ t, leave }: QueueLeaveSheetProps) {
  const stayRef = useRef<HTMLButtonElement>(null);
  const { open, stay } = leave;

  useEffect(() => {
    if (!open) return;
    stayRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, stay]);

  if (!open) return null;
  return (
    <div className={styles.scrim}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="queue-leave-title"
        aria-describedby="queue-leave-body"
      >
        <h2 id="queue-leave-title" className={styles.title}>
          {t('queue_leave_title')}
        </h2>
        <p id="queue-leave-body" className={styles.body}>
          {leave.body}
        </p>
        <div className={styles.actions}>
          <Button ref={stayRef} onClick={stay} disabled={leave.leaving}>
            {t('queue_leave_stay')}
          </Button>
          <Button variant="secondary" onClick={leave.confirm} busy={leave.leaving}>
            {t('queue_leave_confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
