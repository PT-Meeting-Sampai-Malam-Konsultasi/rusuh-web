import type { TFunction } from 'i18next';

import Button from '@presentation/components/Button';

import view from '../../queue-view.module.css';

interface QueueMissedProps {
  t: TFunction;
  onQueueAgain: () => void;
}

/** The 60 s passed without entering: the place went to the next number; queue again for a new one (W-5). */
export default function QueueMissed({ t, onQueueAgain }: QueueMissedProps) {
  return (
    <section className={view.view} aria-live="polite">
      <p className={view.lead}>{t('queue_missed_lead')}</p>
      <h2 className={view.verdict}>{t('queue_missed_title')}</h2>
      <p className={view.copy}>{t('queue_missed_body')}</p>
      <div className={view.actions}>
        <Button onClick={onQueueAgain}>
          {t('queue_missed_action')} <span aria-hidden="true">→</span>
        </Button>
      </div>
    </section>
  );
}
