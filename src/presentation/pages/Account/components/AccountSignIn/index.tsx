import type { TFunction } from 'i18next';

import section from '../../section.module.css';

interface AccountSignInProps {
  t: TFunction;
  email: string;
}

/** "2 Masuk": the sign-in e-mail and how signing in works (a code, no password, ADR-0006). */
export default function AccountSignIn({ t, email }: AccountSignInProps) {
  return (
    <section className={section.section} aria-labelledby="account-sign-in">
      <div className={section.head}>
        <h2 className={section.title} id="account-sign-in">
          <span className={section.no}>2</span>
          {t('account_section_sign_in')}
        </h2>
      </div>
      <dl className={section.rows}>
        <div>
          <dt>{t('account_email_label')}</dt>
          <dd>
            {email}
            <span className={section.verified}>✓ {t('account_verified')}</span>
          </dd>
        </div>
        <div>
          <dt>{t('account_how_label')}</dt>
          <dd className={section.plain}>{t('account_how_value')}</dd>
        </div>
      </dl>
    </section>
  );
}
