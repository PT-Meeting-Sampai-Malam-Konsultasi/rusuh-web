import type { OrderCheckoutView, OrderSummaryView } from '@controllers/order.controller';
import Button from '@presentation/components/Button';

import styles from './order-summary.module.css';

interface OrderSummaryProps {
  summary: OrderSummaryView;
  checkout: OrderCheckoutView;
}

/** "Ringkasan" (FR-16-W1): lines, fee once per order, total, "Lanjut ke pembayaran", the hold note. ≥ 720px only. */
export default function OrderSummary({ summary, checkout }: OrderSummaryProps) {
  const { hint } = checkout;
  return (
    <aside className={styles.summary} aria-labelledby="order-summary-heading">
      <h2 id="order-summary-heading" className={styles.heading}>
        {summary.heading}
      </h2>
      <ul className={styles.lines}>
        {summary.lines.map((line) => (
          <li key={line.key} className={styles.row}>
            <span>{line.label}</span>
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
      <Button
        fullWidth
        disabled={!checkout.enabled}
        busy={checkout.busy}
        onClick={checkout.onContinue}
        aria-describedby={hint ? 'order-summary-hint' : undefined}
      >
        {checkout.label} <span aria-hidden="true">→</span>
      </Button>
      {hint && (
        <p
          id="order-summary-hint"
          className={hint.error ? styles.hintError : styles.hint}
          role={hint.error ? 'alert' : undefined}
        >
          {hint.text}
        </p>
      )}
      <p className={styles.note}>{summary.note}</p>
    </aside>
  );
}
