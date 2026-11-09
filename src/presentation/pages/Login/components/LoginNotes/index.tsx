import type { TFunction } from 'i18next';

import NoteList from '@presentation/components/NoteList';

const NOTES = [
  ['login_note_password_title', 'login_note_password_body'],
  ['login_note_signup_title', 'login_note_signup_body'],
  ['login_note_account_title', 'login_note_account_body'],
] as const;

/** Why there is no password, and that signing up is the same step. */
export default function LoginNotes({ t }: { t: TFunction }) {
  return (
    <NoteList
      label={t('login_flow_title')}
      notes={NOTES.map(([title, body]) => ({ title: t(title), body: t(body) }))}
    />
  );
}
