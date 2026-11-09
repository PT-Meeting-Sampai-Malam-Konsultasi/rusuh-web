import { describe, expect, it, vi } from 'vitest';

import { singleFlight } from '../single-flight';

describe('singleFlight', () => {
  it('shares one run between concurrent calls and starts again afterwards', async () => {
    let resolve: (value: boolean) => void = () => {};
    const task = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const run = singleFlight(task);

    const first = run();
    const second = run();
    expect(task).toHaveBeenCalledTimes(1);
    resolve(true);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);

    const third = run();
    expect(task).toHaveBeenCalledTimes(2);
    resolve(false);
    await expect(third).resolves.toBe(false);
  });

  it('starts again after a failure', async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');
    const run = singleFlight(task);
    await expect(run()).rejects.toThrow('boom');
    await expect(run()).resolves.toBe('ok');
  });
});
