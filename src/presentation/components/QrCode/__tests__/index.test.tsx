import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import QrCode from '..';

describe('QrCode', () => {
  it('draws one square per dark module, named for screen readers', () => {
    render(
      <QrCode
        label="QR tiket SMD-FB-04827"
        modules={[
          [true, false],
          [false, true],
        ]}
      />,
    );
    const svg = screen.getByRole('img', { name: 'QR tiket SMD-FB-04827' });
    expect(svg.getAttribute('viewBox')).toBe('0 0 2 2');
    expect(svg.getAttribute('width')).toBe('132');
    expect(svg.querySelector('path')?.getAttribute('d')).toBe('M0 0h1v1h-1zM1 1h1v1h-1z');
  });
});
