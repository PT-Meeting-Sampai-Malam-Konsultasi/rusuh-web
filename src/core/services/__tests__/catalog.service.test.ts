import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogService } from '../catalog.service';

describe('CatalogService', () => {
  const coreHttp = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  const service = CatalogService({ coreHttp });

  beforeEach(() => vi.clearAllMocks());

  it('gets the event list from core', async () => {
    const response = { data: { items: [], serverNow: '2026-11-03T03:00:00Z' }, status: 200 };
    coreHttp.get.mockResolvedValue(response);
    await expect(service.listEvents()).resolves.toBe(response);
    expect(coreHttp.get).toHaveBeenCalledTimes(1);
    expect(coreHttp.get).toHaveBeenCalledWith('events');
  });

  it('lets the HttpError through unchanged', async () => {
    const error = { status: 0, code: 'NETWORK_ERROR', message: 'offline' };
    coreHttp.get.mockRejectedValue(error);
    await expect(service.listEvents()).rejects.toBe(error);
  });
});
