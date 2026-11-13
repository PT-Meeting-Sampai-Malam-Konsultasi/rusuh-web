import type { TFunction } from 'i18next';

import type { OrderHolderView } from '@controllers/order.controller';
import TextField from '@presentation/components/TextField';

import styles from './holder-list.module.css';

interface HolderListProps {
  t: TFunction;
  holders: OrderHolderView[];
}

/**
 * Section 2: one block per ticket with the KTP name and the NIK with its check states (FR-15-W1: error, Dukcapil tick,
 * "checking" status and "Periksa lagi"). No "Saya sendiri / Orang lain" choice: the profile holds no NIK (D17), so
 * every holder is typed in. ADR-0007: no profile-NIK card, no "save NIK to profile".
 */
export default function HolderList({ t, holders }: HolderListProps) {
  return (
    <section className={styles.section} aria-labelledby="order-holders-heading">
      <div className={styles.head}>
        <h2 className={styles.heading} id="order-holders-heading">
          <span className={styles.badge} aria-hidden="true">
            2
          </span>
          {t('order_holders_heading')}
        </h2>
        <p className={styles.note}>{t('order_holders_note')}</p>
      </div>
      <ul className={styles.list}>
        {holders.map((holder) => (
          <li key={holder.key} className={styles.block}>
            <h3 className={styles.title} id={`order-holder-${holder.key}-title`}>
              {holder.title}
            </h3>
            <div className={styles.fields}>
              <TextField
                id={holder.name.id}
                label={t('order_holder_name_label')}
                placeholder={t('order_holder_name_placeholder')}
                hint={holder.name.hint}
                value={holder.name.value}
                autoComplete="off"
                onChange={(e) => holder.name.onChange(e.currentTarget.value)}
                onBlur={holder.name.onBlur}
              />
              <div className={styles.nikCell}>
                <TextField
                  id={holder.nik.id}
                  label={t('order_holder_nik_label')}
                  placeholder={t('order_holder_nik_placeholder')}
                  hint={holder.nik.checking ? t('order_nik_checking') : t('order_holder_nik_hint')}
                  error={holder.nik.error}
                  valid={holder.nik.valid}
                  aria-busy={holder.nik.checking || undefined}
                  value={holder.nik.value}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => holder.nik.onChange(e.currentTarget.value)}
                  onFocus={holder.nik.onFocus}
                  onBlur={holder.nik.onBlur}
                />
                {/* Polite, always mounted: announces "checking" and "valid"; errors go through the field's alert. */}
                <p className={styles.srOnly} role="status">
                  {holder.nik.checking ? t('order_nik_checking') : (holder.nik.valid ?? '')}
                </p>
                {holder.nik.canRecheck && (
                  <button
                    type="button"
                    className={styles.recheck}
                    aria-describedby={`${holder.nik.id}-message`}
                    onClick={holder.nik.recheck}
                  >
                    {t('order_nik_recheck')}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
