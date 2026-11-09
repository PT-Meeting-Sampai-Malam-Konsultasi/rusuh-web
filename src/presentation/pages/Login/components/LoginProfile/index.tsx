import type { TFunction } from 'i18next';

import type { LoginProfileForm } from '@controllers/login.controller';
import Button from '@presentation/components/Button';
import Stamp from '@presentation/components/Stamp';
import TextField from '@presentation/components/TextField';

import step from '../step.module.css';
import styles from './login-profile.module.css';

interface LoginProfileProps {
  t: TFunction;
  form: LoginProfileForm;
}

/** Step 3 (HiFi `profile`, new accounts only): the name as on the KTP. No NIK on the account (ADR-0007, D17). */
export default function LoginProfile({ t, form }: LoginProfileProps) {
  return (
    <section className={step.step}>
      <Stamp tone="soon">{t('login_stamp_new')}</Stamp>
      <h1 className={`${step.title} ${styles.title}`}>{t('login_title_profile')}</h1>
      <p className={step.lead}>
        {t('login_verified_prefix')} <b>{form.email}</b> {t('login_verified_suffix')}
      </p>
      <form
        className={`${step.form} ${styles.form}`}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          form.onSubmit();
        }}
      >
        <TextField
          id="login-name"
          label={t('login_name_label')}
          autoComplete="name"
          autoCapitalize="words"
          maxLength={200}
          hint={t('login_name_hint')}
          error={form.error || undefined}
          {...form.field}
        />
        <Button type="submit" className={styles.submit} busy={form.submitting}>
          {form.submitLabel}{' '}
          <span className={step.arrow} aria-hidden="true">
            →
          </span>
        </Button>
      </form>
    </section>
  );
}
