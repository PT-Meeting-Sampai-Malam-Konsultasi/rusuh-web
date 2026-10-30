import type { InputHTMLAttributes, Ref } from 'react';

import styles from './text-field.module.css';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  valid?: string;
  ref?: Ref<HTMLInputElement>;
}

/** Label, input, and one message line: error ("!"), valid ("✓") or hint. */
export default function TextField({ id, label, hint, error, valid, className, ...rest }: TextFieldProps) {
  const messageId = `${id}-message`;
  const message = error ?? valid ?? hint;
  return (
    <div className={`${styles.field} ${error ? styles.hasError : ''} ${className ?? ''}`}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        {...rest}
      />
      {error && (
        <p id={messageId} className={`${styles.message} ${styles.error}`} role="alert">
          <b aria-hidden="true">!</b>
          {error}
        </p>
      )}
      {!error && valid && (
        <p id={messageId} className={`${styles.message} ${styles.valid}`}>
          <b aria-hidden="true">✓</b>
          {valid}
        </p>
      )}
      {!error && !valid && hint && (
        <p id={messageId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
