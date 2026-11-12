'use client';

import { useState } from 'react';

import styles from './poster.module.css';

export type PosterTone = 'blue' | 'pink' | 'paper' | 'ink';

interface PosterProps {
  tone: PosterTone;
  /**
   * 'thumb': the order page header (58×72 phone, 84×104 from 720px), title only. 'tile': a My tickets card (84px
   * phone, 132px desktop). 'stub': the left of an e-ticket stub, kicker on top (full width × 120px on phones).
   */
  size: 'hero' | 'card' | 'thumb' | 'tile' | 'stub';
  title: string;
  kicker?: string;
  subtitle?: string;
  imageUrl?: string;
  /** Hero only: date and place along the bottom edge. */
  meta?: { date: string; place: string };
  /** The hero poster carries the page's h1. */
  titleAs?: 'h1' | 'p';
  titleId?: string;
  /** Above-the-fold artwork (the order page thumb) loads eagerly. */
  loading?: 'lazy' | 'eager';
  /** Extra class from the page, e.g. a smaller title in a narrow column. */
  className?: string;
}

const IMAGE_SIZE = {
  hero: [400, 500],
  card: [400, 500],
  thumb: [84, 104],
  tile: [132, 165],
  stub: [260, 200],
} as const;

/**
 * Screen-printed event poster: halftone, condensed title, tilted subtitle plate, as the HiFi draws it. The text is
 * always printed; event artwork, when the API has some, lies under it with a dark wash so the title stays readable. An
 * image that fails to load (a 403, a removed file) is dropped, and the printed poster stands on its own.
 */
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
  loading = 'lazy',
  className,
}: PosterProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [width, height] = IMAGE_SIZE[size];
  const thumb = size === 'thumb';
  const artwork = imageUrl && imageUrl !== failedUrl ? imageUrl : null;
  return (
    <div
      className={[styles.poster, styles[tone], styles[size], artwork && styles.withImage, className]
        .filter(Boolean)
        .join(' ')}
    >
      {artwork && (
        <>
          {/* Event artwork from the API: next/image has no optimizer in export mode. Decorative: the text says it all. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.image}
            src={artwork}
            alt=""
            width={width}
            height={height}
            loading={loading}
            onError={() => setFailedUrl(artwork)}
          />
          <span className={styles.wash} aria-hidden="true" />
        </>
      )}
      <div className={styles.inner}>
        {kicker && !thumb && <span className={styles.kicker}>{kicker}</span>}
        {size === 'hero' && !artwork && (
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
        {subtitle && !thumb && <span className={styles.subtitle}>{subtitle}</span>}
        {meta && !thumb && (
          <div className={styles.meta}>
            <b>{meta.date}</b>
            <span>{meta.place}</span>
          </div>
        )}
      </div>
    </div>
  );
}
