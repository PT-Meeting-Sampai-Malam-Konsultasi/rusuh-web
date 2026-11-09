import type { TFunction } from 'i18next';

import type { LoginEmailForm } from '@controllers/login.controller';
import Button from '@presentation/components/Button';
import TextField from '@presentation/components/TextField';

import step from '../step.module.css';
import styles from './login-email.module.css';

interface LoginEmailProps {
  t: TFunction;
  form: LoginEmailForm;
}

/** Step 1 (HiFi `email`): one field, one button. Sign-in and sign-up are the same step (ADR-0006). */
export default function LoginEmail({ t, form }: LoginEmailProps) {
  return (
    <section className={step.step}>
      <h1 className={step.title}>{t('login_title_email')}</h1>
      <p className={step.lead}>{t('login_lead_email')}</p>
      <form
        className={step.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          form.onSubmit();
        }}
      >
        <div className={styles.row}>
          <TextField
            id="login-email"
            className={styles.field}
            label={t('login_email_label')}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t('login_email_placeholder')}
            hint={t('login_email_hint')}
            error={form.error || undefined}
            {...form.field}
          />
          <Button type="submit" className={styles.submit} busy={form.submitting}>
            {t('login_send_code')}{' '}
            <span className={step.arrow} aria-hidden="true">
              →
            </span>
          </Button>
        </div>
        <p className={step.small}>
          {t('login_terms_prefix')} <span className={styles.term}>{t('footer_terms')}</span> {t('login_terms_and')}{' '}
          <span className={styles.term}>{t('footer_privacy')}</span> {t('login_terms_suffix')}
        </p>
      </form>
    </section>
  );
}
