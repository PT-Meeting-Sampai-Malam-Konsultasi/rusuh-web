import styles from './offline-banner.module.css';

interface OfflineBannerProps {
  visible: boolean;
  message: string;
}

/** Non-blocking: loaded content stays usable while offline. */
export default function OfflineBanner({ visible, message }: OfflineBannerProps) {
  return (
    <div className={styles.region} aria-live="polite">
      {visible && <p className={styles.banner}>{message}</p>}
    </div>
  );
}
