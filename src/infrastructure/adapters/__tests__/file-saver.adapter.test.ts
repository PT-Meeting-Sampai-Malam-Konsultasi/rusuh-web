import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFileSaver } from '../file-saver.adapter';

describe('createFileSaver', () => {
  afterEach(() => vi.restoreAllMocks());

  it('downloads a blob or text through a temporary link, then frees the URL', async () => {
    vi.useFakeTimers();
    const created: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return `blob:${created.length}`;
    });
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const saver = createFileSaver();
    const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
    saver.save(pdf, 'RSH-26-084731.pdf');
    saver.save('BEGIN:VCALENDAR', 'samudra.ics', 'text/calendar');

    expect(click).toHaveBeenCalledTimes(2);
    expect(created[0]).toBe(pdf);
    expect(created[1].type).toBe('text/calendar');
    await expect(created[1].text()).resolves.toBe('BEGIN:VCALENDAR');
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:1');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:2');
    vi.useRealTimers();
  });

  it('saves plain text by default', () => {
    const blobs: Blob[] = [];
    Object.assign(URL, { createObjectURL: (b: Blob) => (blobs.push(b), 'blob:x'), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    createFileSaver().save('hi', 'a.txt');
    expect(blobs[0].type).toBe('text/plain');
  });
});
