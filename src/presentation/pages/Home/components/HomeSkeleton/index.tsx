import styles from './home-skeleton.module.css';

interface HomeSkeletonProps {
  label: string;
}

const CARDS = [0, 1, 2, 3];

/** Same layout as the loaded page, so nothing jumps when the list arrives. */
export default function HomeSkeleton({ label }: HomeSkeletonProps) {
  return (
    <div className={styles.skeleton} role="status" aria-label={label}>
      <div className={styles.hero}>
        <div className={styles.poster} />
        <div className={styles.lines}>
          <span className={styles.stamp} />
          <span className={styles.line} />
          <span className={styles.line} />
          <span className={styles.lineShort} />
        </div>
      </div>
      <div className={styles.list}>
        {CARDS.map((card) => (
          <div key={card} className={styles.card}>
            <div className={styles.thumb} />
            <div className={styles.lines}>
              <span className={styles.stamp} />
              <span className={styles.line} />
              <span className={styles.lineShort} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
