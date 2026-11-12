import type { TFunction } from 'i18next';

import NoteList from '@presentation/components/NoteList';

import styles from './queue-notes.module.css';

const NOTES = [
  ['queue_note_safe_title', 'queue_note_safe_body'],
  ['queue_note_turn_title', 'queue_note_turn_body'],
  ['queue_note_closed_title', 'queue_note_closed_body'],
] as const;

interface QueueNotesProps {
  t: TFunction;
  /** Opens the "Keluar dari antrian?" confirm (FR-04-W2); no link without it. */
  onLeave?: () => void;
}

/** Three things people worry about while waiting, answered once under the number; then the way out. */
export default function QueueNotes({ t, onLeave }: QueueNotesProps) {
  return (
    <NoteList
      label={t('queue_notes_label')}
      notes={NOTES.map(([title, body]) => ({ title: t(title), body: t(body) }))}
      aside={
        onLeave ? (
          <div className={styles.leave}>
            <p className={styles.note}>{t('queue_leave_app_note')}</p>
            <button type="button" className={styles.link} onClick={onLeave}>
              {t('queue_leave_link')}
            </button>
          </div>
        ) : undefined
      }
    />
  );
}
