'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

import type { PaymentExpiredView } from '@controllers/payment.controller';
import Button from '@presentation/components/Button';
import Stamp from '@presentation/components/Stamp';

import styles from './payment-expired.module.css';

interface PaymentExpiredProps {
  expired: PaymentExpiredView;
}

/**
 * "Pesanan dibatalkan." (FR-23-W1): the 10 minutes to pay ran out; queue again at the back or go home. The title takes
 * focus on mount so a screen reader announces the change when the page turns expired mid-visit.
 */
export default function PaymentExpired({ expired }: PaymentExpiredProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <section className={styles.expired} aria-labelledby="payment-expired-title">
      <Stamp tone="sold">{expired.stamp}</Stamp>
      <h1 id="payment-expired-title" ref={titleRef} tabIndex={-1} className={styles.title}>
        {expired.title}
      </h1>
      <p className={styles.body}>{expired.body}</p>
      <p className={styles.note}>
        {expired.noteLead && <b className={styles.noteLead}>{expired.noteLead}</b>}
        {expired.noteLead && ' '}
        {expired.note}
      </p>
      <div className={styles.actions}>
        {expired.onQueueAgain && (
          <Button onClick={expired.onQueueAgain}>
            {expired.queueAgainLabel} <span aria-hidden="true">→</span>
          </Button>
        )}
        <Link className={styles.link} href={expired.homeHref}>
          {expired.homeLabel}
        </Link>
      </div>
    </section>
  );
}
