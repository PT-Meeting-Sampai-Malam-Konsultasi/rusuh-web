'use client';

import type { TicketDetailControllerInterface } from '@controllers/ticket-detail.controller';
import container from '@infrastructure/di/container';
import '@infrastructure/di/controllers/ticket-detail';
import AppFooter from '@presentation/components/AppFooter';
import AppHeader from '@presentation/components/AppHeader';
import Button from '@presentation/components/Button';
import ButtonLink from '@presentation/components/ButtonLink';
import TabBar from '@presentation/components/TabBar';

import CalendarMenu from './components/CalendarMenu';
import TicketSkeleton from './components/TicketSkeleton';
import TicketStub from './components/TicketStub';
import styles from './ticket-detail.module.css';

export default function TicketDetailScreen() {
  const { t, status, ticket, email, printTickets, calendar, errorMessage, retry, ticketsHref, locale, setLocale, nav } =
    container.resolve<TicketDetailControllerInterface>('ticketDetailController');

  const message = (title: string, body: string, retryable = false) => (
    <section className={styles.message} role={retryable ? 'alert' : undefined}>
      <h1 className={styles.messageTitle}>{title}</h1>
      <p className={styles.messageBody}>{body}</p>
      {retryable ? (
        <Button onClick={retry}>{t('action_retry')}</Button>
      ) : (
        <ButtonLink href={ticketsHref}>{t('ticket_all_tickets')}</ButtonLink>
      )}
    </section>
  );

  return (
    <div className={styles.page}>
      <AppHeader
        nav={nav}
        locale={locale}
        onLocaleChange={setLocale}
        labels={{ home: t('logo_home_label'), nav: t('nav_main_label'), language: t('language_switch_label') }}
      />
      <main className={styles.main} aria-busy={status === 'loading'}>
        {status === 'loading' && <TicketSkeleton />}
        {status === 'error' && message(t('ticket_error_title'), errorMessage, true)}
        {status === 'not-found' && message(t('ticket_not_found_title'), t('ticket_not_found_body'))}
        {status === 'not-paid' && message(t('ticket_not_paid_title'), t('ticket_not_paid_body'))}
        {status === 'ready' && ticket && (
          <>
            <section className={styles.hero}>
              <div>
                <span className={styles.stamp}>✓ {ticket.stamp}</span>
                <h1 className={styles.heading}>{ticket.heading}</h1>
                <p className={styles.lead}>
                  {ticket.lead}
                  {email && (
                    <>
                      {' '}
                      {t('ticket_lead_email')} <b>{email}</b>.
                    </>
                  )}
                </p>
              </div>
              <div className={styles.actions}>
                <Button onClick={printTickets} fullWidth>
                  {t('ticket_download')} <span aria-hidden="true">↓</span>
                </Button>
                {calendar && <CalendarMenu t={t} calendar={calendar} />}
                <p className={styles.orderLine}>
                  {t('ticket_order')}{' '}
                  {ticket.orderCode && (
                    <>
                      <b>{ticket.orderCode}</b> ·{' '}
                    </>
                  )}
                  {[ticket.total, ticket.method].filter(Boolean).join(' · ')}
                </p>
              </div>
            </section>
            <section className={styles.stubs} aria-label={t('ticket_stubs_label')}>
              {ticket.stubs.map((stub) => (
                <div key={stub.id} className={styles.sheet}>
                  <TicketStub t={t} stub={stub} />
                </div>
              ))}
            </section>
            <section className={styles.gate} aria-labelledby="ticket-gate">
              <h2 className={styles.gateTitle} id="ticket-gate">
                {t('ticket_gate_title')}
              </h2>
              <ol>
                <li>{t('ticket_gate_qr')}</li>
                <li>{t('ticket_gate_ktp')}</li>
                <li>{t('ticket_gate_once')}</li>
              </ol>
            </section>
          </>
        )}
      </main>
      <AppFooter t={t} />
      <TabBar label={t('nav_app_label')} nav={nav} />
    </div>
  );
}
