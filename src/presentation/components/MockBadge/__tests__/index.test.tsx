import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import MockBadge from '../index';

describe('MockBadge', () => {
  it('labels the page as sample data', () => {
    render(<MockBadge label="Data contoh" hint="API tiruan" />);
    expect(screen.getByText('Data contoh')).toHaveAttribute('title', 'API tiruan');
  });
});
