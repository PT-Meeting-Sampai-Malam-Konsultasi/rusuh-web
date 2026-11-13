import type { OrderCheckoutView, OrderSummaryView } from '@controllers/order.controller';
import Button from '@presentation/components/Button';

import styles from './order-dock.module.css';

interface OrderDockProps {
  summary: OrderSummaryView;
  checkout: OrderCheckoutView;
}

/** The phone bar (FR-16-W1): "3 tiket · Rp 2.160.000 · Lanjut bayar →", fixed to the bottom below 720px. */
export default function OrderDock({ summary, checkout }: OrderDockProps) {
  const { hint } = checkout;
  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <section className={styles.dock} aria-label={summary.dockLabel}>
        {hint && (
          <p
            id="order-dock-hint"
            className={hint.error ? styles.hintError : styles.hint}
            role={hint.error ? 'alert' : undefined}
          >
            {hint.text}
          </p>
        )}
        <div className={styles.row}>
          <p className={styles.amount}>
            <span className={styles.count}>{summary.ticketCount}</span>
            <strong>{summary.total}</strong>
          </p>
          <Button
            className={styles.button}
            disabled={!checkout.enabled}
            busy={checkout.busy}
            onClick={checkout.onContinue}
            aria-describedby={hint ? 'order-dock-hint' : undefined}
          >
            {checkout.shortLabel} <span aria-hidden="true">→</span>
          </Button>
        </div>
      </section>
    </>
  );
}
