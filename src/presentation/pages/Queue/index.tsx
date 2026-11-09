'use client';

import type { QueueControllerInterface, QueueStatus } from '@controllers/queue.controller';
import container from '@infrastructure/di/container';
import AppFooter from '@presentation/components/AppFooter';
import AppHeader from '@presentation/components/AppHeader';
import TabBar from '@presentation/components/TabBar';

import QueueEvent from './components/QueueEvent';
import QueueJoining from './components/QueueJoining';
import QueueMessage from './components/QueueMessage';
import QueueNotes from './components/QueueNotes';
import QueuePaused from './components/QueuePaused';
import QueuePrequeue from './components/QueuePrequeue';
import QueueSoldOut from './components/QueueSoldOut';
import QueueWaiting from './components/QueueWaiting';
import styles from './queue.module.css';

/** States shown in the waiting room layout; the rest are a plain message. */
const ROOM: readonly QueueStatus[] = ['joining', 'waiting', 'prequeue', 'paused', 'sold-out'];
/** States where the buyer holds a place, so the reassurance notes apply. */
const WITH_NOTES: readonly QueueStatus[] = ['waiting', 'prequeue', 'paused'];

const MESSAGES = {
  'no-event': ['queue_no_event_title', 'queue_no_event_body'],
  'not-found': ['queue_not_found_title', 'queue_not_found_body'],
  elsewhere: ['queue_elsewhere_title', 'queue_elsewhere_body'],
  error: ['queue_error_title', ''],
} as const;

export default function QueueScreen() {
  const { t, status, event, waiting, prequeue, paused, errorMessage, retry, locale, setLocale, nav, homeHref } =
    container.resolve<QueueControllerInterface>('queueController');

  const message = status in MESSAGES ? MESSAGES[status as keyof typeof MESSAGES] : null;

  return (
    <div className={styles.page}>
      <AppHeader
        nav={nav}
        locale={locale}
        onLocaleChange={setLocale}
        labels={{ home: t('logo_home_label'), nav: t('nav_main_label'), language: t('language_switch_label') }}
      />
      <main className={styles.main} aria-busy={status === 'joining'}>
        {ROOM.includes(status) && (
          <div className={styles.room}>
            <h1 className={styles.heading}>{event ? `${t('queue_title')}: ${event.name}` : t('queue_title')}</h1>
            <div className={styles.column}>
              {status === 'joining' && <QueueJoining t={t} />}
              {waiting && <QueueWaiting t={t} waiting={waiting} />}
              {status === 'prequeue' && <QueuePrequeue t={t} prequeue={prequeue} />}
              {paused && <QueuePaused t={t} paused={paused} />}
              {status === 'sold-out' && <QueueSoldOut t={t} eventName={event?.name ?? null} homeHref={homeHref} />}
            </div>
            {event && (
              <div className={styles.aside}>
                <QueueEvent
                  event={event}
                  label={t('queue_title')}
                  overlay={status === 'sold-out' ? t('home_sold_out_overlay') : null}
                />
              </div>
            )}
            {WITH_NOTES.includes(status) && (
              <div className={styles.notes}>
                <QueueNotes t={t} />
              </div>
            )}
          </div>
        )}
        {message && (
          <QueueMessage
            title={t(message[0])}
            body={status === 'error' ? errorMessage : t(message[1])}
            homeHref={homeHref}
            homeLabel={status === 'error' ? t('action_back_home') : t('queue_other_events')}
            retryLabel={status === 'error' ? t('action_retry') : undefined}
            onRetry={status === 'error' ? retry : undefined}
          />
        )}
      </main>
      <AppFooter t={t} />
      <TabBar label={t('nav_app_label')} nav={nav} />
    </div>
  );
}
