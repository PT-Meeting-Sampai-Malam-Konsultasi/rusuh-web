import { describe, expect, it, vi } from 'vitest';

import { createPrinter } from '../printer.adapter';

describe('createPrinter', () => {
  it('opens the print dialog of the window it is given, or the page', () => {
    const print = vi.fn();
    createPrinter(() => ({ print }) as unknown as Window).print();
    expect(print).toHaveBeenCalledTimes(1);

    const pagePrint = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    createPrinter().print();
    expect(pagePrint).toHaveBeenCalledTimes(1);
  });
});
