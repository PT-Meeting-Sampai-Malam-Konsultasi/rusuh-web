import styles from './payment-skeleton.module.css';

interface PaymentSkeletonProps {
  /** Visually hidden "Memuat…"; omitted in the Suspense fallback (no translations there). */
  label?: string;
  /** Route fallback only: a header placeholder and the aside, so nothing shifts when the screen mounts. */
  withHeader?: boolean;
}

/** Same-size placeholder of the panel (intro) and, in the route fallback, the aside. */
export default function PaymentSkeleton({ label, withHeader = false }: PaymentSkeletonProps) {
  const panel = (
    <div className={styles.skeleton} role="status" aria-busy="true">
      {label && <span className={styles.srOnly}>{label}</span>}
      <div className={styles.intro} aria-hidden="true">
        <span className={styles.head}>
          <span className={styles.number} />
          <span className={styles.heading} />
        </span>
        <span className={styles.line} />
        <span className={styles.lineShort} />
        <span className={styles.note} />
      </div>
    </div>
  );

  if (!withHeader) return panel;

  return (
    <div className={styles.page}>
      <div className={styles.headerBar} aria-hidden="true" />
      <main className={styles.main} aria-busy="true">
        <div className={styles.flowMain}>{panel}</div>
        <div className={styles.aside} aria-hidden="true">
          <span className={styles.asideHeading} />
          <span className={styles.asideLine} />
          <span className={styles.asideRow} />
          <span className={styles.asideRow} />
          <span className={styles.asideTotal} />
          <span className={styles.asideButton} />
        </div>
      </main>
    </div>
  );
}
