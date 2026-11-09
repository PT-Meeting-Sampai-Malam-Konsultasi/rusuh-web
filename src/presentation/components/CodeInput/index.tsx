'use client';

import { Fragment, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

import styles from './code-input.module.css';

interface CodeInputProps {
  id: string;
  /** Group label ("Kode 6 digit"). */
  label: string;
  /** Accessible name of one box ("Digit 2 dari 6"). */
  digitLabel: (position: number) => string;
  value: string;
  onChange: (value: string) => void;
  length?: number;
  invalid?: boolean;
  disabled?: boolean;
  /** Id of the message under the boxes (error or hint). */
  describedBy?: string;
}

const digitsOf = (text: string) => text.replace(/\D/g, '');

/**
 * One box per digit (HiFi `.otp`). Typing moves to the next box, Backspace on an empty box goes back, and a pasted or
 * autofilled code (`one-time-code`) fills every box from where it lands.
 */
export default function CodeInput({
  id,
  label,
  digitLabel,
  value,
  onChange,
  length = 6,
  invalid = false,
  disabled = false,
  describedBy,
}: CodeInputProps) {
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const focus = (index: number) => boxes.current[Math.max(0, Math.min(length - 1, index))]?.focus();

  /** Writes `digits` starting at box `index`, then focuses the box after the last one written. */
  const fill = (index: number, digits: string) => {
    const start = Math.min(index, value.length);
    const next = (value.slice(0, start) + digits + value.slice(start + digits.length)).slice(0, length);
    onChange(next);
    focus(start + digits.length);
  };

  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !value[index] && index > 0) {
      event.preventDefault();
      onChange(value.slice(0, index - 1) + value.slice(index));
      focus(index - 1);
    } else if (event.key === 'ArrowLeft') {
      focus(index - 1);
    } else if (event.key === 'ArrowRight') {
      focus(index + 1);
    }
  };

  const onPaste = (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const digits = digitsOf(event.clipboardData.getData('text'));
    if (digits) fill(index, digits);
  };

  return (
    <div
      id={id}
      className={`${styles.code} ${invalid ? styles.invalid : ''}`}
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
    >
      {Array.from({ length }, (_, index) => (
        <Fragment key={index}>
          {index === length / 2 && (
            <span className={styles.dash} aria-hidden="true">
              -
            </span>
          )}
          <input
            ref={(node) => {
              boxes.current[index] = node;
            }}
            className={styles.box}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            aria-label={digitLabel(index + 1)}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            value={value[index] ?? ''}
            onChange={(event) => {
              const digits = digitsOf(event.target.value);
              if (!digits) return onChange(value.slice(0, index) + value.slice(index + 1));
              // Autofill puts the whole code in one box; typing over a filled box gives two digits, the new one last.
              fill(index, digits.length > 2 ? digits : digits.slice(-1));
            }}
            onKeyDown={onKeyDown(index)}
            onPaste={onPaste(index)}
            onFocus={(event) => event.target.select()}
          />
        </Fragment>
      ))}
    </div>
  );
}
