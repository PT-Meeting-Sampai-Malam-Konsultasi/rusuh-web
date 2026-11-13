import styles from './switch.module.css';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** "Aktif" / "Nonaktif": shown beside the switch, so the state never relies on colour. */
  onLabel: string;
  offLabel: string;
  /** What the switch turns on, when no visible heading names it. */
  ariaLabel?: string;
  describedBy?: string;
}

/** A checkbox with `role="switch"`: ink when on, with the state written beside it. */
export default function Switch({ checked, onChange, onLabel, offLabel, ariaLabel, describedBy }: SwitchProps) {
  return (
    <label className={styles.switch}>
      <input
        type="checkbox"
        role="switch"
        className={styles.input}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
      />
      <span aria-hidden="true">{checked ? onLabel : offLabel}</span>
    </label>
  );
}
