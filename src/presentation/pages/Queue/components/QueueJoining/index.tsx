import type { TFunction } from 'i18next';

import { TURNSTILE_SLOT_ID } from '@utils/constants/turnstile';

import view from '../../queue-view.module.css';
import styles from './queue-joining.module.css';

interface QueueJoiningProps {
  /** Absent in the route's Suspense fallback, before translations are wired: the skeleton only. */
  t?: TFunction;
}

/** Getting the number: the security check runs here, and its box appears only if Cloudflare asks for a click. */
export default function QueueJoining({ t }: QueueJoiningProps) {
  return (
    <section className={view.view} aria-busy="true">
      {t ? <p className={view.lead}>{t('queue_joining_title')}</p> : <span className={styles.line} />}
      <div className={styles.number} aria-hidden="true" />
      {t && <p className={view.say}>{t('queue_joining_body')}</p>}
      <div id={TURNSTILE_SLOT_ID} className={styles.slot} />
    </section>
  );
}
