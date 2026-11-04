import styles from './language-switch.module.css';

export type SwitchLocale = 'id' | 'en';

interface LanguageSwitchProps {
  label: string;
  locale: SwitchLocale;
  onChange: (locale: SwitchLocale) => void;
}

const OPTIONS: readonly SwitchLocale[] = ['id', 'en'];

/** ID / EN pill: the ink knob slides under the chosen language. */
export default function LanguageSwitch({ label, locale, onChange }: LanguageSwitchProps) {
  return (
    <div className={`${styles.switch} ${locale === 'en' ? styles.en : ''}`} role="group" aria-label={label}>
      <i className={styles.knob} aria-hidden="true" />
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={styles.option}
          aria-pressed={locale === option}
          onClick={() => onChange(option)}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
