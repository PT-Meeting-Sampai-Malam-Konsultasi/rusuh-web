'use client';

import { useEffect, useRef, useState } from 'react';

import Button from '@presentation/components/Button';
import Switch from '@presentation/components/Switch';

import styles from './consent-settings.module.css';

interface ConsentSettingsProps {
  open: boolean;
  /** The saved choice; the switch starts from it (off when never asked). */
  analytics: boolean;
  /** Translated copy. */
  labels: {
    title: string;
    intro: string;
    requiredTitle: string;
    requiredOn: string;
    requiredBody: string;
    analyticsTitle: string;
    analyticsBody: string;
    note: string;
    on: string;
    off: string;
    save: string;
    cancel: string;
  };
  onSave: (analytics: boolean) => void;
  onClose: () => void;
}

/** "Pengaturan privasi": required storage (always on) and the analytics switch. A dialog on desktop, a sheet on phones. */
export default function ConsentSettings({ open, ...sheet }: ConsentSettingsProps) {
  // Mounted on each open, so the switch starts again from the saved choice.
  return open ? <Sheet {...sheet} /> : null;
}

function Sheet({ analytics, labels, onSave, onClose }: Omit<ConsentSettingsProps, 'open'>) {
  const [draft, setDraft] = useState(analytics);
  const saveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    saveRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.scrim}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="consent-settings-title">
        <h2 className={styles.title} id="consent-settings-title">
          {labels.title}
        </h2>
        <p className={styles.intro}>{labels.intro}</p>
        <div className={styles.rows}>
          <div className={styles.row}>
            <h3 className={styles.rowTitle}>{labels.requiredTitle}</h3>
            <span className={styles.on}>{labels.requiredOn}</span>
            <p className={styles.rowBody}>{labels.requiredBody}</p>
          </div>
          <div className={styles.row}>
            <h3 className={styles.rowTitle} id="consent-analytics-title">
              {labels.analyticsTitle}
            </h3>
            <Switch
              checked={draft}
              onChange={setDraft}
              onLabel={labels.on}
              offLabel={labels.off}
              ariaLabel={labels.analyticsTitle}
              describedBy="consent-analytics-body"
            />
            <p className={styles.rowBody} id="consent-analytics-body">
              {labels.analyticsBody}
            </p>
          </div>
        </div>
        <p className={styles.note}>{labels.note}</p>
        <div className={styles.actions}>
          <Button
            ref={saveRef}
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            {labels.save}
          </Button>
          <button type="button" className={styles.cancel} onClick={onClose}>
            {labels.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
