import Link from 'next/link';
import type { ReactNode } from 'react';

import LanguageSwitch, { type SwitchLocale } from '@presentation/components/LanguageSwitch';

import styles from './flow-header.module.css';

export interface FlowHeaderStep {
  number: 1 | 2 | 3;
  label: string;
  current: boolean;
  /** Finished step: "✓" instead of the number, plus labels.done for screen readers. */
  done?: boolean;
}

interface FlowHeaderProps {
  homeHref: string;
  steps: FlowHeaderStep[];
  locale: SwitchLocale;
  onLocaleChange: (locale: SwitchLocale) => void;
  backHref: string;
  /** Phone app bar title ("Pilih tiket"). */
  title: string;
  labels: { home: string; steps: string; language: string; back: string; done?: string };
  /** Countdown (FR-17-W1). Rendered in both bars when present; nothing otherwise. */
  timer?: ReactNode;
}

/** Purchase-flow chrome: logo, steps, language and timer from 720px; below it the app bar (back, title, timer). */
export default function FlowHeader({
  homeHref,
  steps,
  locale,
  onLocaleChange,
  backHref,
  title,
  labels,
  timer,
}: FlowHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link className={styles.logo} href={homeHref} aria-label={labels.home}>
          RUSUH<b>!</b>
        </Link>
        <ol className={styles.steps} aria-label={labels.steps}>
          {steps.map((step) => (
            <li
              key={step.number}
              className={step.done ? styles.stepDone : styles.step}
              aria-current={step.current ? 'step' : undefined}
            >
              <b className={styles.stepNumber} aria-hidden={step.done || undefined}>
                {step.done ? '✓' : step.number}
              </b>
              {step.label}
              {step.done && labels.done && <span className={styles.srOnly}> ({labels.done})</span>}
            </li>
          ))}
        </ol>
        <div className={styles.right}>
          <LanguageSwitch label={labels.language} locale={locale} onChange={onLocaleChange} />
          {timer && <div className={styles.timer}>{timer}</div>}
        </div>
      </div>
      <div className={styles.appBar}>
        <Link className={styles.back} href={backHref} aria-label={labels.back}>
          <span aria-hidden="true">←</span>
        </Link>
        <span className={styles.title}>{title}</span>
        <div className={styles.appBarRight}>{timer && <div className={styles.timer}>{timer}</div>}</div>
      </div>
    </header>
  );
}
