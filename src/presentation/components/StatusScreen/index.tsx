import type { ReactNode } from 'react';

import styles from './status-screen.module.css';

interface StatusScreenProps {
  title: string;
  body: string;
  note?: string;
  children?: ReactNode;
}

/** Full-page message (404, error fallbacks): big condensed title, one line of help, actions. */
export default function StatusScreen({ title, body, note, children }: StatusScreenProps) {
  return (
    <main className={styles.screen}>
      <p className={styles.logo} aria-hidden="true">
        RUSUH<b>!</b>
      </p>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.body}>{body}</p>
      {note && <p className={styles.note}>{note}</p>}
      {children && <div className={styles.actions}>{children}</div>}
    </main>
  );
}
