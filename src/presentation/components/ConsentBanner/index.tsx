import Button from '@presentation/components/Button';

import styles from './consent-banner.module.css';

interface ConsentBannerProps {
  visible: boolean;
  /** The waiting room: one short line, never over the number. */
  compact: boolean;
  /** Translated copy. */
  labels: { title: string; body: string; more: string; accept: string; decline: string };
  onAccept: () => void;
  onDecline: () => void;
  onMore: () => void;
}

/**
 * Asks for analytics cookies (NFR-09-W2, PDP law). A strip, not a wall: the page stays usable. "Terima" is the main
 * button and "Tolak" a full button of the same size beside it, so declining is one obvious tap too.
 */
export default function ConsentBanner({ visible, compact, labels, onAccept, onDecline, onMore }: ConsentBannerProps) {
  if (!visible) return null;
  return (
    <>
      <div className={[styles.spacer, compact && styles.spacerCompact].filter(Boolean).join(' ')} aria-hidden="true" />
      <aside
        className={[styles.banner, compact && styles.compact].filter(Boolean).join(' ')}
        aria-labelledby="consent-title"
        data-consent-banner={compact ? 'compact' : 'full'}
      >
        <div className={styles.inner}>
          <div className={styles.copy}>
            <h2 className={styles.title} id="consent-title">
              {labels.title}
            </h2>
            <p className={styles.body}>
              {labels.body}{' '}
              <button type="button" className={styles.more} onClick={onMore}>
                {labels.more}
              </button>
            </p>
          </div>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onDecline}>
              {labels.decline}
            </Button>
            <Button onClick={onAccept}>{labels.accept}</Button>
          </div>
        </div>
      </aside>
    </>
  );
}
