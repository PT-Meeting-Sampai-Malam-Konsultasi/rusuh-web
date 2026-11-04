import Button from '@presentation/components/Button';

import styles from './home-message.module.css';

interface HomeMessageProps {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Empty list or a failed load: what happened, and the one thing to do about it. */
export default function HomeMessage({ title, body, actionLabel, onAction }: HomeMessageProps) {
  return (
    <section className={styles.message} aria-labelledby="home-message-title">
      <h1 className={styles.title} id="home-message-title">
        {title}
      </h1>
      <p className={styles.body} role={onAction ? 'alert' : undefined}>
        {body}
      </p>
      {actionLabel && onAction && (
        <div className={styles.actions}>
          <Button onClick={onAction}>{actionLabel}</Button>
        </div>
      )}
    </section>
  );
}
