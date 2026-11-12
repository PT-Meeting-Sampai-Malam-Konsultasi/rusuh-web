import Link from 'next/link';
import type { TFunction } from 'i18next';

import type { QueueLeftView } from '@controllers/queue.controller';
import Button from '@presentation/components/Button';

import view from '../../queue-view.module.css';
import styles from './queue-left.module.css';

interface QueueLeftProps {
  t: TFunction;
  left: QueueLeftView;
  homeHref: string;
  onQueueAgain: () => void;
}

/** The buyer gave the number up on purpose (FR-04-W2): still on the waiting room, free to queue again at the back. */
export default function QueueLeft({ t, left, homeHref, onQueueAgain }: QueueLeftProps) {
  return (
    <section className={view.view} aria-live="polite">
      <p className={view.lead}>{left.lead}</p>
      <h2 className={view.verdict}>{t('queue_left_title')}</h2>
      <p className={view.copy}>{left.body}</p>
      <div className={view.actions}>
        <Button onClick={onQueueAgain}>
          {t('queue_missed_action')} <span aria-hidden="true">→</span>
        </Button>
        <Link className={styles.link} href={homeHref} prefetch={false}>
          {t('queue_other_events')}
        </Link>
      </div>
    </section>
  );
}
