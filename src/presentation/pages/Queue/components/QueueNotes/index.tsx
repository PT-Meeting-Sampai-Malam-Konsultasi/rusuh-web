import type { TFunction } from 'i18next';

import styles from './queue-notes.module.css';

const NOTES = [
  ['queue_note_safe_title', 'queue_note_safe_body'],
  ['queue_note_turn_title', 'queue_note_turn_body'],
  ['queue_note_closed_title', 'queue_note_closed_body'],
] as const;

/** Three things people worry about while waiting, answered once under the number. */
export default function QueueNotes({ t }: { t: TFunction }) {
  return (
    <section className={styles.notes} aria-label={t('queue_notes_label')}>
      {NOTES.map(([title, body]) => (
        <div key={title} className={styles.note}>
          <h3 className={styles.title}>{t(title)}</h3>
          <p className={styles.body}>{t(body)}</p>
        </div>
      ))}
    </section>
  );
}
