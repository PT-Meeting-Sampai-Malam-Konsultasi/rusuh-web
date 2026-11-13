import type { PaymentActionView, PaymentNotice } from '@controllers/payment.controller';
import Button from '@presentation/components/Button';

import styles from './payment-dock.module.css';

interface PaymentDockProps {
  pay: PaymentActionView;
  notice: PaymentNotice | null;
}

/** Phone bar (FR-20-W1): "Bayar Rp 2.160.000 →", fixed to the bottom below 720px. */
export default function PaymentDock({ pay, notice }: PaymentDockProps) {
  const isError = notice?.tone === 'error';
  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <section className={styles.dock} aria-label={pay.dockRegionLabel}>
        {notice && (
          <p
            id="payment-dock-notice"
            className={isError ? styles.noticeError : styles.notice}
            role={isError ? 'alert' : undefined}
          >
            {notice.text}
          </p>
        )}
        <Button
          fullWidth
          disabled={!pay.enabled}
          busy={pay.busy}
          onClick={pay.onPay}
          aria-describedby={notice ? 'payment-dock-notice' : undefined}
        >
          {pay.busy ? pay.busyLabel : pay.dockLabel} <span aria-hidden="true">→</span>
        </Button>
      </section>
    </>
  );
}
