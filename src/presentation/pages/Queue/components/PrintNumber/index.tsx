import styles from './print-number.module.css';

interface PrintNumberProps {
  value: string;
  /** 'pink' over blue while live; 'ink' over blue for countdowns; 'muted' while paused. */
  tone?: 'pink' | 'ink' | 'muted';
  /** Smaller type for long values ("7 hari 21 jam"). */
  compact?: boolean;
}

const TONES = { pink: styles.tonePink, ink: styles.toneInk, muted: styles.toneMuted };

/** The waiting room's big number in two inks, the blue plate a hair off register (Poster Sablon). */
export default function PrintNumber({ value, tone = 'pink', compact = false }: PrintNumberProps) {
  return (
    <p className={[styles.number, TONES[tone], compact && styles.compact].filter(Boolean).join(' ')}>
      <span className={styles.reg}>
        <span className={styles.plate} aria-hidden="true">
          {value}
        </span>
        <span className={styles.face}>{value}</span>
      </span>
    </p>
  );
}
