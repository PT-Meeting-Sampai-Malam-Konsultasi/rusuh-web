'use client';

import type { AccountControllerInterface } from '@controllers/account.controller';
import container from '@infrastructure/di/container';
import '@infrastructure/di/controllers/account';
import AppFooter from '@presentation/components/AppFooter';
import AppHeader from '@presentation/components/AppHeader';
import Button from '@presentation/components/Button';
import TabBar from '@presentation/components/TabBar';

import styles from './account.module.css';
import AccountAside from './components/AccountAside';
import AccountPrivacy from './components/AccountPrivacy';
import AccountProfile from './components/AccountProfile';
import AccountSignIn from './components/AccountSignIn';

export default function AccountScreen() {
  const { t, status, profile, nameForm, signOut, signingOut, errorMessage, retry, locale, setLocale, privacy, nav } =
    container.resolve<AccountControllerInterface>('accountController');

  return (
    <div className={styles.page}>
      <AppHeader
        nav={nav}
        locale={locale}
        onLocaleChange={setLocale}
        labels={{ home: t('logo_home_label'), nav: t('nav_main_label'), language: t('language_switch_label') }}
      />
      <main className={styles.main} aria-busy={status === 'loading'}>
        <div className={styles.layout}>
          <div className={styles.column}>
            {status === 'loading' && (
              <div className={styles.skeleton} aria-hidden="true">
                <span className={styles.lineXl} />
                <span className={styles.line} />
              </div>
            )}
            {status === 'error' && (
              <section className={styles.message} role="alert">
                <h1 className={styles.messageTitle}>{t('account_error_title')}</h1>
                <p className={styles.messageBody}>{errorMessage}</p>
                <Button onClick={retry}>{t('action_retry')}</Button>
              </section>
            )}
            {profile && (
              <>
                <header>
                  <h1 className={styles.name}>{profile.name || t('account_hero_fallback')}</h1>
                  <p className={styles.email}>{profile.email}</p>
                </header>
                <AccountProfile t={t} name={profile.name} form={nameForm} />
                <AccountSignIn t={t} email={profile.email} />
                {privacy && <AccountPrivacy t={t} analytics={privacy.analytics} onChange={privacy.setAnalytics} />}
                <div className={styles.out}>
                  <Button variant="secondary" onClick={signOut} busy={signingOut}>
                    {t('account_sign_out')}
                  </Button>
                </div>
              </>
            )}
          </div>
          <div className={styles.aside}>
            <AccountAside t={t} />
          </div>
        </div>
      </main>
      <AppFooter t={t} />
      <TabBar label={t('nav_app_label')} nav={nav} />
    </div>
  );
}
