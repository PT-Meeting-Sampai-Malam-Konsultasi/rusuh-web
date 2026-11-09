import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import NotFoundScreen from '../index';

vi.mock('@infrastructure/di/container', () => ({
  default: { resolve: () => ({ t: (k: string) => k, homeHref: '/' }) },
}));
vi.mock('@infrastructure/di/controllers/not-found', () => ({}));

describe('NotFoundScreen', () => {
  it('passes the controller values to the status screen', () => {
    render(<NotFoundScreen />);
    expect(screen.getByRole('heading')).toHaveTextContent('not_found_title');
    expect(screen.getByRole('link', { name: 'action_back_home' })).toHaveAttribute('href', '/');
  });
});
