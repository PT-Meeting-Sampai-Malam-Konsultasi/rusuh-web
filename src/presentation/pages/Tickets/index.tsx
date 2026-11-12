'use client';

import type { TicketsControllerInterface } from '@controllers/tickets.controller';
import container from '@infrastructure/di/container';
import '@infrastructure/di/controllers/tickets';
import AppFooter from '@presentation/components/AppFooter';
import AppHeader from '@presentation/components/AppHeader';
import Button from '@presentation/components/Button';
import ButtonLink from '@presentation/components/ButtonLink';
import TabBar from '@presentation/components/TabBar';

import OrderCard from './components/OrderCard';
import styles from './tickets.module.css';

export default function TicketsScreen() {
  const { t, status, groups, errorMessage, retry, signInHref, homeHref, locale, setLocale, nav } =
    container.resolve<TicketsControllerInterface>('ticketsController');

  return (
    <div className={styles.page}>
      <AppHeader
        nav={nav}
        locale={locale}
        onLocaleChange={setLocale}
        labels={{ home: t('logo_home_label'), nav: t('nav_main_label'), language: t('language_switch_label') }}
      />
      <main className={styles.main} aria-busy={status === 'loading'}>
        <header className={styles.hero}>
          <h1 className={styles.title}>{t('tickets_title')}</h1>
          {status === 'ready' && <p className={styles.lead}>{t('tickets_lead')}</p>}
        </header>

        {status === 'loading' && (
          <div className={styles.skeleton} aria-hidden="true">
            <span />
            <span />
          </div>
        )}

        {status === 'error' && (
          <section className={styles.message} role="alert">
            <h2 className={styles.messageTitle}>{t('tickets_error_title')}</h2>
            <p className={styles.messageBody}>{errorMessage}</p>
            <Button onClick={retry}>{t('action_retry')}</Button>
          </section>
        )}

        {status === 'empty' && (
          <section className={styles.message}>
            <h2 className={styles.messageTitle}>{t('tickets_empty_title')}</h2>
            <p className={styles.messageBody}>{t('tickets_empty_body')}</p>
            <ButtonLink href={homeHref}>
              {t('tickets_empty_action')} <span aria-hidden="true">→</span>
            </ButtonLink>
          </section>
        )}

        {status === 'signed-out' && (
          <section className={styles.message}>
            <h2 className={styles.messageTitle}>{t('tickets_signed_out_title')}</h2>
            <p className={styles.messageBody}>{t('tickets_signed_out_body')}</p>
            <ButtonLink href={signInHref}>
              {t('tickets_signed_out_action')} <span aria-hidden="true">→</span>
            </ButtonLink>
          </section>
        )}

        {groups.map((group) => (
          <section key={group.id} className={styles.group} aria-labelledby={`tickets-${group.id}`}>
            <div className={styles.groupHead}>
              <h2 className={styles.groupTitle} id={`tickets-${group.id}`}>
                {group.title}
              </h2>
              <p className={styles.groupSummary}>{group.summary}</p>
            </div>
            <ol className={styles.list}>
              {group.orders.map((order) => (
                <OrderCard key={order.bookingId} t={t} order={order} />
              ))}
            </ol>
          </section>
        ))}
      </main>
      <AppFooter t={t} />
      <TabBar label={t('nav_app_label')} nav={nav} />
    </div>
  );
}
