import type { TFunction } from 'i18next';

import Switch from '@presentation/components/Switch';

import section from '../../section.module.css';
import styles from './account-privacy.module.css';

interface AccountPrivacyProps {
  t: TFunction;
  analytics: boolean;
  onChange: (analytics: boolean) => void;
}

/** "3 Privasi": the analytics cookie switch (NFR-09-W2), the phone's way into the choice (the footer link is desktop). */
export default function AccountPrivacy({ t, analytics, onChange }: AccountPrivacyProps) {
  return (
    <section className={section.section} aria-labelledby="account-privacy">
      <div className={section.head}>
        <h2 className={section.title} id="account-privacy">
          <span className={section.no}>3</span>
          {t('account_section_privacy')}
        </h2>
      </div>
      <div className={styles.row}>
        <p className={styles.label}>
          {t('account_privacy_label')}
          <small className={styles.hint} id="account-privacy-hint">
            {t('account_privacy_hint')}
          </small>
        </p>
        <Switch
          checked={analytics}
          onChange={onChange}
          onLabel={t('switch_on')}
          offLabel={t('switch_off')}
          ariaLabel={t('account_privacy_label')}
          describedBy="account-privacy-hint"
        />
      </div>
    </section>
  );
}
