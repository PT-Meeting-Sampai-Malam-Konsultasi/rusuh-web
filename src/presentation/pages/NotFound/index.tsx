'use client';

import Link from 'next/link';

import type { NotFoundControllerInterface } from '@controllers/not-found.controller';
import container from '@infrastructure/di/container';
import '@infrastructure/di/controllers/not-found';
import StatusScreen from '@presentation/components/StatusScreen';

import styles from './not-found.module.css';

export default function NotFoundScreen() {
  const { t, homeHref } = container.resolve<NotFoundControllerInterface>('notFoundController');

  return (
    <StatusScreen title={t('not_found_title')} body={t('not_found_body')}>
      <Link className={styles.home} href={homeHref}>
        {t('action_back_home')}
      </Link>
    </StatusScreen>
  );
}
