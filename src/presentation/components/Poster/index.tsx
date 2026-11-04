import styles from './poster.module.css';

export type PosterTone = 'blue' | 'pink' | 'paper' | 'ink';

interface PosterProps {
  tone: PosterTone;
  size: 'hero' | 'card';
  title: string;
  kicker?: string;
  subtitle?: string;
  imageUrl?: string;
  /** Hero only: date and place along the bottom edge. */
  meta?: { date: string; place: string };
  /** The hero poster carries the page's h1. */
  titleAs?: 'h1' | 'p';
  titleId?: string;
}

/** Screen-printed event poster: halftone, condensed title, tilted subtitle plate. Generated when there is no artwork. */
export default function Poster({
  tone,
  size,
  title,
  kicker,
  subtitle,
  imageUrl,
  meta,
  titleAs: Title = 'p',
  titleId,
}: PosterProps) {
  return (
    <div className={`${styles.poster} ${styles[tone]} ${styles[size]}`}>
      {imageUrl ? (
        <>
          {/* Event artwork from the API: next/image has no optimizer in export mode. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.image} src={imageUrl} alt="" width={400} height={500} loading="lazy" />
          <Title className={styles.srOnly} id={titleId}>
            {title}
          </Title>
        </>
      ) : (
        <div className={styles.inner}>
          {kicker && <span className={styles.kicker}>{kicker}</span>}
          {size === 'hero' && (
            <svg className={styles.waves} viewBox="0 0 400 150" aria-hidden="true">
              <g fill="none" strokeWidth="9" strokeLinecap="square">
                <path d="M0 30 q50 -34 100 0 t100 0 t100 0 t100 0" className={styles.waveA} />
                <path d="M0 72 q50 -34 100 0 t100 0 t100 0 t100 0" className={styles.waveB} />
                <path d="M0 114 q50 -34 100 0 t100 0 t100 0 t100 0" className={styles.waveA} />
              </g>
            </svg>
          )}
          <Title className={styles.title} id={titleId}>
            {title.toUpperCase()}
          </Title>
          {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
          {meta && (
            <div className={styles.meta}>
              <b>{meta.date}</b>
              <span>{meta.place}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
