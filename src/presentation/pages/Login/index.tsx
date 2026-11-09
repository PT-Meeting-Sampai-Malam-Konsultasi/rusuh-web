'use client';

import type { LoginControllerInterface } from '@controllers/login.controller';
import container from '@infrastructure/di/container';
import '@infrastructure/di/controllers/login';
import AppFooter from '@presentation/components/AppFooter';
import AppHeader from '@presentation/components/AppHeader';
import EventAside from '@presentation/components/EventAside';

import LoginCode from './components/LoginCode';
import LoginEmail from './components/LoginEmail';
import LoginNotes from './components/LoginNotes';
import LoginProfile from './components/LoginProfile';
import styles from './login.module.css';

export default function LoginScreen() {
  const { t, step, event, emailForm, code, profileForm, locale, setLocale } =
    container.resolve<LoginControllerInterface>('loginController');

  return (
    <div className={styles.page}>
      <AppHeader
        nav={[]}
        locale={locale}
        onLocaleChange={setLocale}
        labels={{ home: t('logo_home_label'), nav: t('nav_main_label'), language: t('language_switch_label') }}
      />
      <main className={styles.main}>
        <div className={styles.layout}>
          <div className={styles.column}>
            {step === 'email' && <LoginEmail t={t} form={emailForm} />}
            {step === 'code' && <LoginCode t={t} code={code} />}
            {step === 'profile' && <LoginProfile t={t} form={profileForm} />}
          </div>
          {event && (
            <div className={styles.aside}>
              <EventAside event={event} label={t('login_next_label')} caption={t('login_next_label')} />
            </div>
          )}
          {step !== 'profile' && (
            <div className={styles.notes}>
              <LoginNotes t={t} />
            </div>
          )}
        </div>
      </main>
      <AppFooter t={t} />
    </div>
  );
}
