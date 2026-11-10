'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import container from '@infrastructure/di/container';
import i18n from '@infrastructure/i18n';
import Button from '@presentation/components/Button';
import StatusScreen from '@presentation/components/StatusScreen';

import styles from '../fallback.module.css';

/** Account segment fallback. Static: no API calls; retry and home. */
export default function AccountError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    container.resolve('analyticsAdapter').reportError(error, { boundary: 'account' });
  }, [error]);

  return (
    <StatusScreen title={i18n.t('error_page_title')} body={i18n.t('error_page_body')}>
      <Button onClick={() => retry()}>{i18n.t('action_retry')}</Button>
      <Link className={styles.link} href="/">
        {i18n.t('action_back_home')}
      </Link>
    </StatusScreen>
  );
}
