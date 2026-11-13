import type { PaymentActionView, PaymentNotice, PaymentSummaryView } from '@controllers/payment.controller';
import Button from '@presentation/components/Button';

import styles from './payment-summary.module.css';

interface PaymentSummaryProps {
  summary: PaymentSummaryView;
  /** null while verifying (confirming) or leaving: no button then. */
  pay: PaymentActionView | null;
  notice: PaymentNotice | null;
}

/**
 * "Pesanan" (FR-20-W1): order code, event, one line per ticket, fee once, total, Bayar, legal. On phones it is a flat
 * card under the panel without the notice and button: PaymentDock carries those there.
 */
export default function PaymentSummary({ summary, pay, notice }: PaymentSummaryProps) {
  const isError = notice?.tone === 'error';
  return (
    <aside className={styles.summary} aria-labelledby="payment-summary-heading">
      <h2 id="payment-summary-heading" className={styles.heading}>
        {summary.heading} <span className={styles.orderCode}>{summary.orderCode}</span>
      </h2>
      {summary.eventLine && <p className={styles.event}>{summary.eventLine}</p>}
      <ul className={styles.lines}>
        {summary.lines.map((line) => (
          <li key={line.key} className={styles.row}>
            <span>
              {line.category}
              <small className={styles.nik}>{line.nik}</small>
            </span>
            <span>{line.amount}</span>
          </li>
        ))}
      </ul>
      <div className={styles.fee}>
        <span>{summary.feeLabel}</span>
        <span>{summary.fee}</span>
      </div>
      <div className={styles.total}>
        <span>{summary.totalLabel}</span>
        <strong>{summary.total}</strong>
      </div>
      <div className={styles.action}>
        {notice && (
          <p
            id="payment-summary-notice"
            className={isError ? styles.noticeError : styles.notice}
            role={isError ? 'alert' : undefined}
          >
            {notice.text}
          </p>
        )}
        {pay && (
          <Button
            fullWidth
            disabled={!pay.enabled}
            busy={pay.busy}
            onClick={pay.onPay}
            aria-describedby={notice ? 'payment-summary-notice' : undefined}
          >
            {pay.busy ? pay.busyLabel : pay.label} <span aria-hidden="true">→</span>
          </Button>
        )}
      </div>
      <p className={styles.legal}>{summary.legal}</p>
    </aside>
  );
}
