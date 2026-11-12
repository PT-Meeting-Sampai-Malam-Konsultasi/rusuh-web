import styles from './timer.module.css';

interface TimerProps {
  /** Seconds left, computed by the controller from server time. */
  seconds: number;
  label?: string;
  /** Turns pink at or below this many seconds (60 on the order page, 120 on payment). */
  warnAt?: number;
  /** Phone app-bar form below 720px (22px value, 3px offset, label visually removed); normal from 720px. */
  compact?: boolean;
}

export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.floor(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function Timer({ seconds, label, warnAt = 60, compact }: TimerProps) {
  const warn = seconds <= warnAt;
  return (
    <div
      className={`${styles.timer} ${warn ? styles.warn : ''}`}
      role="timer"
      aria-live={warn ? 'polite' : 'off'}
      data-compact={compact || undefined}
    >
      <span className={styles.time}>{formatSeconds(seconds)}</span>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
