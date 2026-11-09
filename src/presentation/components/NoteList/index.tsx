import styles from './note-list.module.css';

export interface Note {
  title: string;
  body: string;
}

interface NoteListProps {
  label: string;
  notes: readonly Note[];
}

/** A ruled row of short reassurances under the main content: three columns on desktop, stacked on phones. */
export default function NoteList({ label, notes }: NoteListProps) {
  return (
    <section className={styles.notes} aria-label={label}>
      {notes.map(({ title, body }) => (
        <div key={title} className={styles.note}>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.body}>{body}</p>
        </div>
      ))}
    </section>
  );
}
