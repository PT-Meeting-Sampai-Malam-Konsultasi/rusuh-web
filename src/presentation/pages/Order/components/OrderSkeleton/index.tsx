import styles from './order-skeleton.module.css';

interface OrderSkeletonProps {
  /** Visually hidden status text; absent in the route fallback (no translations on the server). */
  label?: string;
  /** Route fallback only: a placeholder bar with the flow header's height, so nothing shifts when the screen mounts. */
  withHeader?: boolean;
}

const ROWS = [0, 1, 2, 3];

/** Same layout as the loaded page: thumb and two lines, the section heading, four category rows. */
export default function OrderSkeleton({ label, withHeader = false }: OrderSkeletonProps) {
  const content = (
    <div className={styles.skeleton} role="status">
      {label && <span className={styles.srOnly}>{label}</span>}
      <div className={styles.event} aria-hidden="true">
        <span className={styles.thumb} />
        <span className={styles.lines}>
          <span className={styles.title} />
          <span className={styles.line} />
        </span>
      </div>
      <div className={styles.section} aria-hidden="true">
        <span className={styles.head}>
          <span className={styles.heading} />
          <span className={styles.note} />
        </span>
        {ROWS.map((row) => (
          <span key={row} className={styles.row}>
            <span className={styles.name} />
            <span className={styles.description} />
          </span>
        ))}
      </div>
    </div>
  );

  if (!withHeader) return content;

  return (
    <div className={styles.page}>
      <div className={styles.headerBar} aria-hidden="true" />
      <main className={styles.main} aria-busy="true">
        <div className={styles.flowMain}>{content}</div>
      </main>
    </div>
  );
}
