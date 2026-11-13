import type { PaymentIntroView } from '@controllers/payment.controller';

import styles from './payment-intro.module.css';

interface PaymentIntroProps {
  intro: PaymentIntroView;
}

/** "2 Bayar dengan Midtrans" + how it works (the customer picks the method on Snap, H-3). */
export default function PaymentIntro({ intro }: PaymentIntroProps) {
  return (
    <section className={styles.intro} aria-labelledby="payment-intro-heading">
      <div className={styles.head}>
        <h1 id="payment-intro-heading" className={styles.heading}>
          <span className={styles.number} aria-hidden="true">
            2
          </span>
          {intro.heading}
        </h1>
      </div>
      <p className={styles.body}>{intro.body}</p>
      <p className={styles.note}>{intro.note}</p>
    </section>
  );
}
