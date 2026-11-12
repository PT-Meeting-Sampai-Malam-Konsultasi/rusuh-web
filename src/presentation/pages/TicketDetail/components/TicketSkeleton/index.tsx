import styles from './ticket-skeleton.module.css';

/** Same footprint as the loaded page: hero, then two stubs. Also the route's Suspense fallback. */
export default function TicketSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <span className={styles.heading} />
      <span className={styles.stub} />
      <span className={styles.stub} />
    </div>
  );
}
