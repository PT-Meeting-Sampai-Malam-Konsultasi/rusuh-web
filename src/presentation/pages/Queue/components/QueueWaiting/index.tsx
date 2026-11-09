import type { CSSProperties } from 'react';
import type { TFunction } from 'i18next';

import type { QueueWaitingView } from '@controllers/queue.controller';

import view from '../../queue-view.module.css';
import PrintNumber from '../PrintNumber';
import styles from './queue-waiting.module.css';

interface QueueWaitingProps {
  t: TFunction;
  waiting: QueueWaitingView;
}

/** "Anda antrian ke-1.248" and how far the line has moved since the buyer joined (FR-06). */
export default function QueueWaiting({ t, waiting }: QueueWaitingProps) {
  return (
    <section className={view.view} aria-live="polite">
      <p className={view.lead}>{t('queue_lead_position')}</p>
      <PrintNumber value={waiting.position} />
      <div
        className={`${styles.track} ${view.rise}`}
        style={{ '--p': `${waiting.progress}%`, '--i': 2 } as CSSProperties}
        role="progressbar"
        aria-label={t('queue_track_label')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={waiting.progress}
      >
        <div className={styles.fill} />
        <div className={styles.me} />
      </div>
      <div className={styles.labels}>
        <span>{t('queue_track_joined')}</span>
        <span className={styles.mid}>
          {t('queue_track_serving')} <b>{t('queue_number', { number: waiting.served })}</b> · {t('queue_track_yours')}{' '}
          <b>{t('queue_number', { number: waiting.seq })}</b>
        </span>
        <span>{t('queue_track_turn')}</span>
      </div>
    </section>
  );
}
