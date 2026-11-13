import Link from 'next/link';

import type { PaymentMessageView } from '@controllers/payment.controller';
import Button from '@presentation/components/Button';

import styles from './payment-message.module.css';

interface PaymentMessageProps {
  message: PaymentMessageView;
}

/** No longer active / not found / load error, with home (FR-23-W1 builds the full expired screen). */
export default function PaymentMessage({ message }: PaymentMessageProps) {
  const canRetry = !!message.actionLabel && !!message.onAction;
  return (
    <section className={styles.message} aria-labelledby="payment-message-title">
      <h1 id="payment-message-title" className={styles.title}>
        {message.title}
      </h1>
      <p className={styles.body} role={canRetry ? 'alert' : undefined}>
        {message.body}
      </p>
      {message.note && <p className={styles.note}>{message.note}</p>}
      <div className={styles.actions}>
        {canRetry && <Button onClick={message.onAction ?? undefined}>{message.actionLabel}</Button>}
        <Link className={styles.link} href={message.homeHref}>
          {message.homeLabel}
        </Link>
      </div>
    </section>
  );
}
