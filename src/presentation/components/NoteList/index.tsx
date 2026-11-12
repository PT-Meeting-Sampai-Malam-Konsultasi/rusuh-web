import type { ReactNode } from 'react';

import styles from './note-list.module.css';

export interface Note {
  title: string;
  body: string;
}

interface NoteListProps {
  label: string;
  notes: readonly Note[];
  /** A fourth cell at the end of the row (the waiting room's "Keluar dari antrian"). */
  aside?: ReactNode;
}

/** A ruled row of short reassurances under the main content: three columns on desktop, stacked on phones. */
export default function NoteList({ label, notes, aside }: NoteListProps) {
  return (
    <section className={[styles.notes, aside && styles.withAside].filter(Boolean).join(' ')} aria-label={label}>
      {notes.map(({ title, body }) => (
        <div key={title} className={styles.note}>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.body}>{body}</p>
        </div>
      ))}
      {aside && <div className={`${styles.note} ${styles.aside}`}>{aside}</div>}
    </section>
  );
}
