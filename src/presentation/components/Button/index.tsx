import type { ButtonHTMLAttributes, Ref } from 'react';

import styles from './button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  busy?: boolean;
  fullWidth?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/** Ink plate on a hard offset; pressing sinks it into the shadow. Label says what happens. */
export default function Button({
  variant = 'primary',
  busy = false,
  fullWidth = false,
  type = 'button',
  className,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], fullWidth && styles.full, busy && styles.busy, className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {children}
    </button>
  );
}
