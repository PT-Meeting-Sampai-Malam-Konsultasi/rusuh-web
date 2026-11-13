'use client';

import type { PaymentControllerInterface } from '@controllers/payment.controller';
import container from '@infrastructure/di/container';
import '@infrastructure/di/controllers/payment';
import FlowHeader from '@presentation/components/FlowHeader';
import Timer from '@presentation/components/Timer';

import PaymentDock from './components/PaymentDock';
import PaymentExpired from './components/PaymentExpired';
import PaymentIntro from './components/PaymentIntro';
import PaymentMessage from './components/PaymentMessage';
import PaymentProgress from './components/PaymentProgress';
import PaymentSkeleton from './components/PaymentSkeleton';
import PaymentSummary from './components/PaymentSummary';
import styles from './payment.module.css';

export default function PaymentScreen() {
  const {
    t,
    state,
    steps,
    title,
    intro,
    summary,
    pay,
    notice,
    progress,
    message,
    homeHref,
    backHref,
    locale,
    setLocale,
    timer,
    expired,
  } = container.resolve<PaymentControllerInterface>('paymentController');

  return (
    <div className={styles.page}>
      <FlowHeader
        homeHref={homeHref}
        steps={steps}
        locale={locale}
        onLocaleChange={setLocale}
        backHref={backHref}
        title={title}
        timer={timer && <Timer seconds={timer.seconds} label={timer.label} warnAt={120} compact />}
        labels={{
          home: t('logo_home_label'),
          steps: t('order_steps_label'),
          language: t('language_switch_label'),
          back: t('payment_back_label'),
          done: t('payment_step_done'),
        }}
      />
      <main className={styles.main} aria-busy={state === 'loading'}>
        <div className={styles.flowMain}>
          {state === 'loading' && <PaymentSkeleton label={t('state_loading')} />}
          {intro && <PaymentIntro intro={intro} />}
          {progress && <PaymentProgress progress={progress} />}
          {message && <PaymentMessage message={message} />}
          {expired && <PaymentExpired expired={expired} />}
        </div>
        {summary && <PaymentSummary summary={summary} pay={pay} notice={notice} />}
      </main>
      {summary && pay && <PaymentDock pay={pay} notice={notice} />}
    </div>
  );
}
