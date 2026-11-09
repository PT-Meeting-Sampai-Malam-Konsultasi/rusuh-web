import type { TFunction } from 'i18next';

import type { QueuePrequeueView } from '@controllers/queue.controller';

import view from '../../queue-view.module.css';
import PrintNumber from '../PrintNumber';

interface QueuePrequeueProps {
  t: TFunction;
  /** Null when the answer carries no opening time. */
  prequeue: QueuePrequeueView | null;
}

/** Joined before the sale: the countdown to the draw, and "keep this page open". */
export default function QueuePrequeue({ t, prequeue }: QueuePrequeueProps) {
  return (
    <section className={view.view}>
      {prequeue && (
        <>
          <p className={view.lead}>{t('queue_prequeue_lead')}</p>
          <div role="timer" aria-live="off">
            <PrintNumber value={prequeue.countdown} tone="ink" compact={prequeue.countdown.length > 8} />
          </div>
        </>
      )}
      <p className={view.eta}>
        <strong>{t('queue_prequeue_title')}</strong>
        <span>
          {prequeue?.opensAt ? t('queue_prequeue_body', { time: prequeue.opensAt }) : t('queue_prequeue_body_plain')}
        </span>
      </p>
      <p className={view.say}>{t('queue_prequeue_say')}</p>
    </section>
  );
}
