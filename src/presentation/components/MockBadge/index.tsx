import styles from './mock-badge.module.css';

interface MockBadgeProps {
  label: string;
  hint: string;
}

/** Shown while the API is mocked, so nobody takes demo data for real sales. */
export default function MockBadge({ label, hint }: MockBadgeProps) {
  return (
    <p className={styles.badge} title={hint}>
      {label}
    </p>
  );
}
