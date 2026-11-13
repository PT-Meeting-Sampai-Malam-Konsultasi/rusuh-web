import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AppFooter from '../index';

describe('AppFooter', () => {
  it('shows the copyright and the links', () => {
    render(<AppFooter t={((k: string) => k) as never} />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent('footer_copyright');
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'footer_terms',
      'footer_privacy',
      'footer_refund',
      'footer_help',
      'footer_cookies',
    ]);
    expect(screen.getByRole('link', { name: 'footer_terms' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'footer_privacy' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'footer_refund' })).toHaveAttribute('href', '/refund');
    expect(screen.getByRole('link', { name: 'footer_help' })).toHaveAttribute('href', '/help');
    expect(screen.getByRole('link', { name: 'footer_cookies' })).toHaveAttribute('href', '#cookie-settings');
  });
});
