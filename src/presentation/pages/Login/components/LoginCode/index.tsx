import type { TFunction } from 'i18next';

import type { LoginCodeView } from '@controllers/login.controller';
import Button from '@presentation/components/Button';
import CodeInput from '@presentation/components/CodeInput';

import step from '../step.module.css';
import styles from './login-code.module.css';

interface LoginCodeProps {
  t: TFunction;
  code: LoginCodeView;
}

/** Step 2 (HiFi `otp`, `wrong`, `expired`): six boxes, resend countdown, and a new code when this one is spent. */
export default function LoginCode({ t, code }: LoginCodeProps) {
  const spent = code.state === 'expired' || code.state === 'locked';
  const messageId = 'login-code-message';

  return (
    <section className={step.step}>
      <h1 className={step.title}>{spent ? t('login_title_expired') : t('login_title_code')}</h1>
      <p className={step.lead}>
        {t('login_sent_to')} <b>{code.email}</b>{' '}
        <button type="button" className={step.textButton} onClick={code.onChangeEmail}>
          {t('login_change_email')}
        </button>
      </p>
      <form
        className={step.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          code.onSubmit();
        }}
      >
        <div className={styles.field}>
          <p className={styles.label} id="login-code-label">
            {t('login_code_label')}
          </p>
          <CodeInput
            id="login-code"
            label={t('login_code_label')}
            digitLabel={(n) => t('login_code_digit_label', { n })}
            value={code.value}
            onChange={code.onChange}
            length={code.length}
            invalid={code.state !== 'idle'}
            disabled={spent || code.submitting}
            describedBy={code.message ? messageId : undefined}
          />
          {code.message && (
            <p id={messageId} className={step.alert} role="alert">
              <b aria-hidden="true">!</b>
              {code.message}
            </p>
          )}
        </div>

        {spent ? (
          <Button
            fullWidth
            className={styles.submit}
            onClick={code.onResend}
            disabled={code.resendIn !== null}
            busy={code.resending}
          >
            {t('login_send_new_code')}{' '}
            <span className={step.arrow} aria-hidden="true">
              →
            </span>
          </Button>
        ) : (
          <Button
            type="submit"
            fullWidth
            className={styles.submit}
            busy={code.submitting}
            // After a wrong code the same digits would only be rejected again: edit a box first.
            disabled={code.value.length < code.length || code.state === 'wrong'}
          >
            {t('login_submit_code')}{' '}
            <span className={step.arrow} aria-hidden="true">
              →
            </span>
          </Button>
        )}

        <div className={styles.resend}>
          {code.resendIn ? (
            <p>
              {t('login_resend_in')}{' '}
              <b role="timer" aria-live="off">
                {code.resendIn}
              </b>
            </p>
          ) : (
            !spent && (
              <button
                type="button"
                className={step.textButton}
                onClick={code.onResend}
                disabled={code.resending}
                aria-busy={code.resending || undefined}
              >
                {t('login_resend')}
              </button>
            )
          )}
          {code.resendError && (
            <p className={step.alert} role="alert">
              <b aria-hidden="true">!</b>
              {code.resendError}
            </p>
          )}
        </div>

        {!spent && <p className={step.small}>{t('login_spam_note', { time: code.validFor })}</p>}
      </form>
    </section>
  );
}
