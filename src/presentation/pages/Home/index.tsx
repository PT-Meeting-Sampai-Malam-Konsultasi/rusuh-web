'use client';

import type { HomeControllerInterface } from '@controllers/home.controller';
import container from '@infrastructure/di/container';
import AppFooter from '@presentation/components/AppFooter';
import AppHeader from '@presentation/components/AppHeader';
import TabBar from '@presentation/components/TabBar';

import EventList from './components/EventList';
import HomeHero from './components/HomeHero';
import HomeMessage from './components/HomeMessage';
import HomeSkeleton from './components/HomeSkeleton';
import styles from './home.module.css';

export default function HomeScreen() {
  const {
    t,
    status,
    featured,
    events,
    countLabel,
    errorMessage,
    retry,
    locale,
    setLocale,
    nav,
    joinHint,
    selectEvent,
  } = container.resolve<HomeControllerInterface>('homeController');

  return (
    <div className={styles.page}>
      <AppHeader
        nav={nav}
        locale={locale}
        onLocaleChange={setLocale}
        labels={{ home: t('logo_home_label'), nav: t('nav_main_label'), language: t('language_switch_label') }}
      />
      <main className={styles.main} aria-busy={status === 'loading'}>
        {status === 'loading' && <HomeSkeleton label={t('state_loading')} />}
        {status === 'error' && (
          <HomeMessage
            title={t('home_error_title')}
            body={errorMessage}
            actionLabel={t('action_retry')}
            onAction={retry}
          />
        )}
        {status === 'empty' && <HomeMessage title={t('home_empty_title')} body={t('home_empty_body')} />}
        {status === 'ready' && featured && (
          <HomeHero t={t} event={featured} joinHint={joinHint} onSelect={selectEvent} />
        )}
        {status === 'ready' && events.length > 0 && (
          <EventList t={t} events={events} countLabel={countLabel} isMainHeading={!featured} onSelect={selectEvent} />
        )}
      </main>
      <AppFooter t={t} />
      <TabBar label={t('nav_app_label')} nav={nav} />
    </div>
  );
}
