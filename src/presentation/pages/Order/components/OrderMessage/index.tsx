import Link from 'next/link';

import Button from '@presentation/components/Button';

import styles from './order-message.module.css';

interface OrderMessageProps {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  homeHref: string;
  homeLabel: string;
}

/** Failed load or unknown event: what happened, retry when it can help, and a way home. */
export default function OrderMessage({ title, body, actionLabel, onAction, homeHref, homeLabel }: OrderMessageProps) {
  const canRetry = !!actionLabel && !!onAction;
  return (
    <section className={styles.message} aria-labelledby="order-message-title">
      <h1 className={styles.title} id="order-message-title">
        {title}
      </h1>
      <p className={styles.body} role={canRetry ? 'alert' : undefined}>
        {body}
      </p>
      <div className={styles.actions}>
        {canRetry && <Button onClick={onAction}>{actionLabel}</Button>}
        <Link className={styles.link} href={homeHref}>
          {homeLabel}
        </Link>
      </div>
    </section>
  );
}
