import type { TFunction } from 'i18next';

import type { AccountNameForm } from '@controllers/account.controller';
import Button from '@presentation/components/Button';
import TextField from '@presentation/components/TextField';

import section from '../../section.module.css';
import styles from './account-profile.module.css';

interface AccountProfileProps {
  t: TFunction;
  name: string;
  form: AccountNameForm;
}

/** "1 Data diri": the name as on the KTP, printed on the e-ticket. No NIK here: it goes in per ticket (D17). */
export default function AccountProfile({ t, name, form }: AccountProfileProps) {
  return (
    <section className={section.section} aria-labelledby="account-profile">
      <div className={section.head}>
        <h2 className={section.title} id="account-profile">
          <span className={section.no}>1</span>
          {t('account_section_profile')}
        </h2>
        {!form.editing && (
          <button type="button" className={section.link} onClick={form.edit}>
            {t('account_edit')}
          </button>
        )}
      </div>
      {form.editing ? (
        <form
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            form.onSubmit();
          }}
        >
          <TextField
            id="account-name"
            label={t('login_name_label')}
            autoComplete="name"
            autoCapitalize="words"
            maxLength={200}
            hint={t('account_name_hint')}
            error={form.error || undefined}
            {...form.field}
          />
          <div className={styles.actions}>
            <Button type="submit" busy={form.saving}>
              {t('account_save')}
            </Button>
            <button type="button" className={section.link} onClick={form.cancel}>
              {t('account_cancel')}
            </button>
          </div>
        </form>
      ) : (
        <dl className={section.rows}>
          <div>
            <dt>{t('login_name_label')}</dt>
            <dd className={name ? undefined : section.missing}>{name || t('account_name_missing')}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
