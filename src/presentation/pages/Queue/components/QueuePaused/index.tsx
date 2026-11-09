import type { TFunction } from 'i18next';

import type { QueuePausedView } from '@controllers/queue.controller';

import view from '../../queue-view.module.css';
import PrintNumber from '../PrintNumber';

interface QueuePausedProps {
  t: TFunction;
  paused: QueuePausedView;
}

/** The line stopped (stock coming back, or the organiser checking): the number stays, faded. */
export default function QueuePaused({ t, paused }: QueuePausedProps) {
  return (
    <section className={view.view} aria-live="polite">
      <p className={view.lead}>{paused.position ? t('queue_paused_lead') : t('queue_paused_lead_plain')}</p>
      {paused.position && <PrintNumber value={paused.position} tone="muted" />}
      <p className={view.eta}>
        <strong>{t('queue_paused_title')}</strong>
        <span>{paused.reason}</span>
      </p>
      <p className={view.say}>{t('queue_paused_say')}</p>
    </section>
  );
}
