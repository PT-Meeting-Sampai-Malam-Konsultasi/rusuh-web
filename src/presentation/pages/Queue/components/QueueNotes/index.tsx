import type { TFunction } from 'i18next';

import NoteList from '@presentation/components/NoteList';

const NOTES = [
  ['queue_note_safe_title', 'queue_note_safe_body'],
  ['queue_note_turn_title', 'queue_note_turn_body'],
  ['queue_note_closed_title', 'queue_note_closed_body'],
] as const;

/** Three things people worry about while waiting, answered once under the number. */
export default function QueueNotes({ t }: { t: TFunction }) {
  return (
    <NoteList
      label={t('queue_notes_label')}
      notes={NOTES.map(([title, body]) => ({ title: t(title), body: t(body) }))}
    />
  );
}
