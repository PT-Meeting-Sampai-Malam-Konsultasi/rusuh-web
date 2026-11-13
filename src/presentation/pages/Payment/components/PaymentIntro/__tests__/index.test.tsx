import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { introView } from '../../../__tests__/fixtures';
import PaymentIntro from '../index';

describe('PaymentIntro', () => {
  it('shows the h1 with a hidden step number, the body and the note', () => {
    render(<PaymentIntro intro={introView()} />);
    const heading = screen.getByRole('heading', { level: 1, name: 'payment_heading' });
    expect(screen.getByText('2')).toHaveAttribute('aria-hidden', 'true');
    expect(heading).toContainElement(screen.getByText('2'));
    expect(screen.getByRole('region', { name: 'payment_heading' })).toBeInTheDocument();
    expect(screen.getByText('payment_intro')).toBeInTheDocument();
    expect(screen.getByText('payment_intro_note')).toBeInTheDocument();
  });

  it('starts its CSS module with the @reference and uses no hex or print effect', () => {
    const css = readFileSync(join(__dirname, '..', 'payment-intro.module.css'), 'utf8');
    expect(css.split('\n')[0]).toBe('@reference "../../../../../styles/app.css";');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/rotate|halftone|pink/);
  });
});
