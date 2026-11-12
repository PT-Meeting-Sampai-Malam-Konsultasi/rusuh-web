'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

import type { OrderTimeUpView } from '@controllers/order.controller';
import Button from '@presentation/components/Button';
import Stamp from '@presentation/components/Stamp';

import styles from './order-time-up-sheet.module.css';

interface OrderTimeUpSheetProps {
  sheet: OrderTimeUpView;
}

/**
 * "5 menit sudah lewat." (FR-18-W1): the order window ended, the place went to the next number. Not dismissible: the
 * only ways out are "Antre lagi" (primary, focused) and "Ke beranda". A dialog on desktop, a bottom sheet on phones.
 */
export default function OrderTimeUpSheet({ sheet }: OrderTimeUpSheetProps) {
  const queueAgainRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    queueAgainRef.current?.focus();
  }, []);

  return (
    <div className={styles.scrim}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-time-up-title"
        aria-describedby="order-time-up-body"
      >
        <Stamp tone="sold">{sheet.stamp}</Stamp>
        <h2 id="order-time-up-title" className={styles.title}>
          {sheet.title}
        </h2>
        <p id="order-time-up-body" className={styles.body}>
          {sheet.body}
        </p>
        <div className={styles.actions}>
          <Button ref={queueAgainRef} onClick={sheet.queueAgain}>
            {sheet.queueAgainLabel} <span aria-hidden="true">→</span>
          </Button>
          <Link className={styles.link} href={sheet.homeHref}>
            {sheet.homeLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
