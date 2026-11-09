import type { TFunction } from 'i18next';

import type { QueueTurnView } from '@controllers/queue.controller';
import Button from '@presentation/components/Button';
import ButtonLink from '@presentation/components/ButtonLink';
import Timer from '@presentation/components/Timer';

import view from '../../queue-view.module.css';
import styles from './queue-turn.module.css';

interface QueueTurnProps {
  t: TFunction;
  turn: QueueTurnView;
  onClaim: () => void;
}

/** "Giliran Anda!": signed in, we move the buyer in at once; a guest signs in first (FR-08, ADR-0025). */
export default function QueueTurn({ t, turn, onClaim }: QueueTurnProps) {
  const title = t('queue_turn_title');
  return (
    <section className={view.view} aria-live="polite">
      <p className={view.lead}>{t('queue_turn_lead', { number: turn.seq })}</p>
      <h2 className={view.verdict}>
        <span className={styles.reg}>
          <span className={styles.plate} aria-hidden="true">
            {title}
          </span>
          <span className={styles.face}>{title}</span>
        </span>
      </h2>
      <div className={view.actions}>
        {turn.signInHref ? (
          <ButtonLink href={turn.signInHref}>
            {t('queue_turn_sign_in')} <span aria-hidden="true">→</span>
          </ButtonLink>
        ) : (
          <Button onClick={onClaim} busy={turn.claiming}>
            {t('queue_turn_action')} <span aria-hidden="true">→</span>
          </Button>
        )}
        {turn.seconds !== null && <Timer seconds={turn.seconds} label={t('queue_turn_timer')} />}
      </div>
      <p className={view.say}>{turn.signInHref ? t('queue_turn_say_guest') : t('queue_turn_say')}</p>
    </section>
  );
}
