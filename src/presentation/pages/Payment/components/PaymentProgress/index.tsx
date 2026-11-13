import type { PaymentProgressView } from '@controllers/payment.controller';

import styles from './payment-progress.module.css';

interface PaymentProgressProps {
  progress: PaymentProgressView;
}

/** Verifying / waiting / paid (HiFi "verifying" section): the server's status decides, never the Snap callback. */
export default function PaymentProgress({ progress }: PaymentProgressProps) {
  return (
    <section className={styles.progress} role="status" aria-live="polite">
      <div className={styles.spin} aria-hidden="true" />
      <h1 className={styles.title}>{progress.title}</h1>
      <p className={styles.body}>{progress.body}</p>
      {progress.held && <p className={styles.held}>{progress.held}</p>}
    </section>
  );
}
