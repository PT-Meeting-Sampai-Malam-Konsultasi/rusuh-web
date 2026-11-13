import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import PaymentSkeleton from '../index';

describe('PaymentSkeleton', () => {
  it('is a busy status with a visually hidden label and no main of its own', () => {
    render(<PaymentSkeleton label="state_loading" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('state_loading');
    expect(screen.queryByRole('main')).toBeNull();
  });

  it('adds a header placeholder and a busy main in the route fallback, without a label', () => {
    render(<PaymentSkeleton withHeader />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('starts its CSS module with the @reference and pulses only without reduced motion', () => {
    const css = readFileSync(join(__dirname, '..', 'payment-skeleton.module.css'), 'utf8');
    expect(css.split('\n')[0]).toBe('@reference "../../../../../styles/app.css";');
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*animation: pulse/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
