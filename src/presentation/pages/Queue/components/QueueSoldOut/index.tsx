import type { TFunction } from 'i18next';

import ButtonLink from '@presentation/components/ButtonLink';

import view from '../../queue-view.module.css';

interface QueueSoldOutProps {
  t: TFunction;
  eventName: string | null;
  homeHref: string;
}

/** Sold out before the buyer's turn: say so plainly, nothing was charged, and where to go next (W-7). */
export default function QueueSoldOut({ t, eventName, homeHref }: QueueSoldOutProps) {
  return (
    <section className={view.view} aria-live="polite">
      <p className={view.lead}>
        {eventName ? t('queue_soldout_lead', { name: eventName.toUpperCase() }) : t('queue_soldout_lead_plain')}
      </p>
      <h2 className={view.verdict}>{t('queue_soldout_title')}</h2>
      <p className={view.copy}>{t('queue_soldout_body')}</p>
      <div className={view.actions}>
        <ButtonLink href={homeHref}>
          {t('queue_other_events')} <span aria-hidden="true">→</span>
        </ButtonLink>
      </div>
    </section>
  );
}
