import type { ReactNode } from 'react';

import styles from './stamp.module.css';

export type StampTone = 'on' | 'soon' | 'full' | 'sold' | 'ended' | 'paid';

interface StampProps {
  tone: StampTone;
  children: ReactNode;
}

/** Status stamp: word first, one style per status so it survives greyscale. */
export default function Stamp({ tone, children }: StampProps) {
  return (
    <span className={`${styles.stamp} ${styles[tone]}`}>
      {tone === 'on' && <i className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
