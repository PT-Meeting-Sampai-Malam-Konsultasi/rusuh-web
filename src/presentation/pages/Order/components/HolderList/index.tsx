import type { TFunction } from 'i18next';

import type { OrderHolderView } from '@controllers/order.controller';
import TextField from '@presentation/components/TextField';

import styles from './holder-list.module.css';

interface HolderListProps {
  t: TFunction;
  /** False when the profile has no name or /me failed: no radiogroup, plain fields. */
  showChoice: boolean;
  holders: OrderHolderView[];
}

/**
 * Section 2: one block per ticket with the "Saya sendiri / Orang lain" choice (native radios, so arrow keys skip the
 * disabled "Saya sendiri"), the KTP name and the NIK. ADR-0007: no profile-NIK card, no "save NIK to profile".
 */
export default function HolderList({ t, showChoice, holders }: HolderListProps) {
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
            <div className={styles.blockHead}>
              <h3 className={styles.title} id={`order-holder-${holder.key}-title`}>
                {holder.title}
              </h3>
              {showChoice && (
                <div
                  role="radiogroup"
                  className={styles.choice}
                  aria-label={t('order_holder_for_label')}
                  aria-describedby={`order-holder-${holder.key}-title`}
                >
                  <label className={styles.option} data-kind="self">
                    <input
                      type="radio"
                      className={styles.radio}
                      name={holder.choiceName}
                      value="self"
                      checked={holder.holderType === 'self'}
                      disabled={holder.selfDisabled}
                      onChange={() => holder.choose('self')}
                    />
                    <span>{t('order_holder_self')}</span>
                  </label>
                  <label className={styles.option} data-kind="other">
                    <input
                      type="radio"
                      className={styles.radio}
                      name={holder.choiceName}
                      value="other"
                      checked={holder.holderType === 'other'}
                      onChange={() => holder.choose('other')}
                    />
                    <span>{t('order_holder_other')}</span>
                  </label>
                </div>
              )}
            </div>
            <div className={styles.fields}>
              <TextField
                id={holder.name.id}
                label={t('order_holder_name_label')}
                placeholder={t('order_holder_name_placeholder')}
                hint={holder.name.hint}
                value={holder.name.value}
                readOnly={holder.name.readOnly}
                autoComplete="off"
                onChange={(e) => holder.name.onChange(e.currentTarget.value)}
              />
              <TextField
                id={holder.nik.id}
                label={t('order_holder_nik_label')}
                placeholder={t('order_holder_nik_placeholder')}
                hint={t('order_holder_nik_hint')}
                value={holder.nik.value}
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => holder.nik.onChange(e.currentTarget.value)}
                onFocus={holder.nik.onFocus}
                onBlur={holder.nik.onBlur}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
