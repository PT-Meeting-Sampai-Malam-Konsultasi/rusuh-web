import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import TicketStub from '..';

const t = ((key: string) => key) as never;
const stub = {
  id: 't1',
  label: 'Tiket 1/3',
  posterTitle: 'Samudra',
  posterTone: 'blue' as const,
  category: 'Festival B',
  holder: 'Nadia Saputri',
  nikMasked: '3174 •••• •••• 0004',
  entry: 'Gerbang 5 · berdiri',
  doorsOpen: 'Sab, 12 Des · 16.00 WIB',
  code: 'SMD-FB-04827',
  qrPayload: 'q',
  qr: [[true]],
  qrLabel: 'QR tiket SMD-FB-04827',
};

describe('TicketStub', () => {
  it('shows the holder with the masked NIK, entry, doors and the QR with its code', () => {
    render(<TicketStub t={t} stub={stub} />);
    expect(screen.getByRole('article', { name: 'Tiket 1/3' })).toBeInTheDocument();
    expect(screen.getByText('Nadia Saputri')).toHaveTextContent('NIK 3174 •••• •••• 0004');
    expect(screen.getByText('Gerbang 5 · berdiri')).toBeInTheDocument();
    expect(screen.getByText('Sab, 12 Des · 16.00 WIB')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'QR tiket SMD-FB-04827' })).toBeInTheDocument();
    expect(screen.getByText('SMD-FB-04827')).toBeInTheDocument();
    expect(screen.getByText('Festival B')).toBeInTheDocument();
    expect(screen.getByText('ticket_print_note')).toBeInTheDocument();
  });

  it('leaves out entry, doors and code when the API sent none', () => {
    render(<TicketStub t={t} stub={{ ...stub, entry: '', doorsOpen: '', code: '' }} />);
    expect(screen.queryByText('ticket_entry')).not.toBeInTheDocument();
    expect(screen.queryByText('ticket_doors')).not.toBeInTheDocument();
    expect(screen.queryByText('SMD-FB-04827')).not.toBeInTheDocument();
  });
});
