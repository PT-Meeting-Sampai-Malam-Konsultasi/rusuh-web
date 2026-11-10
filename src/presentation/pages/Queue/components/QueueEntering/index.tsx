import type { TFunction } from 'i18next';

import view from '../../queue-view.module.css';

interface QueueEnteringProps {
  t: TFunction;
}

/** No queue (FR-05): nobody is ahead, so the buyer is on the way to the order page; no turn screen, no timer. */
export default function QueueEntering({ t }: QueueEnteringProps) {
  return (
    <section className={view.view} aria-busy="true" aria-live="polite">
      <h2 className={view.verdict}>{t('queue_entering_title')}</h2>
      <p className={view.copy}>{t('queue_entering_body')}</p>
    </section>
  );
}
