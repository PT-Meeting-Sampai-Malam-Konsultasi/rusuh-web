import styles from './loading-overlay.module.css';

interface LoadingOverlayProps {
  visible: boolean;
  label: string;
}

export default function LoadingOverlay({ visible, label }: LoadingOverlayProps) {
  if (!visible) return null;
  return (
    <div className={styles.overlay} role="status" aria-live="polite" aria-busy="true">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </div>
  );
}
