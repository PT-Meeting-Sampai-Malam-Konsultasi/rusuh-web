import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ConsentSettings from '../index';

const labels = {
  title: 'Pengaturan privasi',
  intro: 'Hanya untuk perangkat ini.',
  requiredTitle: 'Wajib',
  requiredOn: 'Selalu aktif',
  requiredBody: 'Sesi masuk, nomor antrian, bahasa.',
  analyticsTitle: 'Cookie analitik',
  analyticsBody: 'Google Analytics.',
  note: 'Laporan error tanpa cookie.',
  on: 'Aktif',
  off: 'Nonaktif',
  save: 'Simpan pilihan',
  cancel: 'Batal',
};

const show = (analytics = false) => {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const view = render(<ConsentSettings open analytics={analytics} labels={labels} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose, ...view };
};

describe('ConsentSettings', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConsentSettings open={false} analytics={false} labels={labels} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('starts from the saved choice and saves the switch', async () => {
    const { onSave, onClose } = show(false);
    expect(screen.getByRole('dialog', { name: 'Pengaturan privasi' })).toHaveTextContent('Selalu aktif');
    expect(screen.getByRole('button', { name: 'Simpan pilihan' })).toHaveFocus();
    const toggle = screen.getByRole('switch', { name: 'Cookie analitik' });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole('button', { name: 'Simpan pilihan' }));
    expect(onSave).toHaveBeenCalledWith(true);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without saving on Batal or Escape', async () => {
    const { onSave, onClose } = show(true);
    expect(screen.getByRole('switch')).toBeChecked();
    await userEvent.click(screen.getByRole('switch'));
    await userEvent.click(screen.getByRole('button', { name: 'Batal' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });
});
