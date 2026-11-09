import Button from '@presentation/components/Button';
import ButtonLink from '@presentation/components/ButtonLink';

import styles from './queue-message.module.css';

interface QueueMessageProps {
  title: string;
  body: string;
  homeHref: string;
  homeLabel: string;
  /** Only for failures worth trying again (network, rate limit, the security check). */
  retryLabel?: string;
  onRetry?: () => void;
}

/** No queue to show: what happened and where to go (no event, unknown event, another device, a failure). */
export default function QueueMessage({ title, body, homeHref, homeLabel, retryLabel, onRetry }: QueueMessageProps) {
  return (
    <section className={styles.message} aria-labelledby="queue-message-title">
      <h1 className={styles.title} id="queue-message-title">
        {title}
      </h1>
      <p className={styles.body} role={onRetry ? 'alert' : undefined}>
        {body}
      </p>
      <div className={styles.actions}>
        {retryLabel && onRetry && <Button onClick={onRetry}>{retryLabel}</Button>}
        <ButtonLink href={homeHref} variant={onRetry ? 'secondary' : 'primary'}>
          {homeLabel}
        </ButtonLink>
      </div>
    </section>
  );
}
