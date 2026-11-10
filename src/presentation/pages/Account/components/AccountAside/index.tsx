import type { TFunction } from 'i18next';

import styles from './account-aside.module.css';

interface AccountAsideProps {
  t: TFunction;
}

/** Where the NIK goes instead of the account: per ticket on the order page (ADR-0007, D17). */
export default function AccountAside({ t }: AccountAsideProps) {
  return (
    <aside className={styles.card} aria-labelledby="account-nik">
      <h2 className={styles.title} id="account-nik">
        {t('account_nik_title')}
      </h2>
      <ol className={styles.steps}>
        <li>{t('account_nik_1')}</li>
        <li>{t('account_nik_2')}</li>
        <li>{t('account_nik_3')}</li>
      </ol>
      <p className={styles.safe}>{t('account_nik_safe')}</p>
    </aside>
  );
}
