import Link from 'next/link';
import type { ReactNode } from 'react';

import styles from '../Button/button.module.css';

interface ButtonLinkProps {
  href: string;
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'sm';
  fullWidth?: boolean;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}

/** A link that looks exactly like Button: for actions that go to another page. Same styles, one source. */
export default function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  onClick,
  children,
}: ButtonLinkProps) {
  const classes = [styles.button, styles[variant], size === 'sm' && styles.sm, fullWidth && styles.full, className]
    .filter(Boolean)
    .join(' ');
  // prefetch off: target pages (e.g. /queue?event=…) depend on runtime ids, and some do not exist yet.
  return (
    <Link className={classes} href={href} prefetch={false} onClick={onClick}>
      {children}
    </Link>
  );
}
