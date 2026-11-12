'use client';

import type { OrderControllerInterface } from '@controllers/order.controller';
import container from '@infrastructure/di/container';
import '@infrastructure/di/controllers/order';
import FlowHeader from '@presentation/components/FlowHeader';
import Timer from '@presentation/components/Timer';

import CategoryList from './components/CategoryList';
import HolderList from './components/HolderList';
import OrderEventHeader from './components/OrderEventHeader';
import OrderMessage from './components/OrderMessage';
import OrderSkeleton from './components/OrderSkeleton';
import styles from './order.module.css';

export default function OrderScreen() {
  const {
    t,
    status,
    event,
    categories,
    increment,
    decrement,
    showHolders,
    showHolderChoice,
    holders,
    limitNotice,
    categoryNote,
    errorMessage,
    retry,
    steps,
    backHref,
    homeHref,
    locale,
    setLocale,
    timer,
  } = container.resolve<OrderControllerInterface>('orderController');

  return (
    <div className={styles.page}>
      <FlowHeader
        homeHref={homeHref}
        steps={steps}
        locale={locale}
        onLocaleChange={setLocale}
        backHref={backHref}
        title={t('order_title')}
        labels={{
          home: t('logo_home_label'),
          steps: t('order_steps_label'),
          language: t('language_switch_label'),
          back: t('order_back_label'),
        }}
        timer={timer && <Timer seconds={timer.seconds} label={timer.label} compact />}
      />
      <main className={styles.main} aria-busy={status === 'loading'}>
        <div className={styles.flowMain}>
          {status === 'loading' && <OrderSkeleton label={t('state_loading')} />}
          {status === 'error' && (
            <OrderMessage
              title={t('order_error_title')}
              body={errorMessage}
              actionLabel={t('action_retry')}
              onAction={retry}
              homeHref={homeHref}
              homeLabel={t('action_back_home')}
            />
          )}
          {status === 'not-found' && (
            <OrderMessage
              title={t('order_not_found_title')}
              body={t('order_not_found_body')}
              homeHref={homeHref}
              homeLabel={t('action_back_home')}
            />
          )}
          {status === 'ready' && event && <OrderEventHeader event={event} />}
          {status === 'ready' && (
            <CategoryList
              heading={t('order_category_heading')}
              note={categoryNote}
              categories={categories}
              onIncrement={increment}
              onDecrement={decrement}
              limitNotice={limitNotice}
            />
          )}
          {status === 'ready' && showHolders && <HolderList t={t} showChoice={showHolderChoice} holders={holders} />}
        </div>
        {/* Summary aside: deferred (FR-14-W1 and the hold) */}
      </main>
    </div>
  );
}
