import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PaymentService } from '../payment.service';

describe('PaymentService', () => {
  const coreHttp = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  const service = PaymentService({ coreHttp });

  beforeEach(() => vi.clearAllMocks());

  describe('getPaymentPage', () => {
    it('gets the payment view from core with no config', async () => {
      const response = { data: { bookingId: 'bk_1', orderCode: 'RSH-26-084731', currentSnap: null }, status: 200 };
      coreHttp.get.mockResolvedValue(response);
      await expect(service.getPaymentPage('bk_1')).resolves.toBe(response);
      expect(coreHttp.get).toHaveBeenCalledTimes(1);
      expect(coreHttp.get.mock.calls[0]).toEqual(['payment/payments/bk_1']);
      expect(coreHttp.post).not.toHaveBeenCalled();
    });

    it('encodes the booking id so it never changes the path shape', async () => {
      coreHttp.get.mockResolvedValue({ data: {}, status: 200 });
      await service.getPaymentPage('a/b?c d');
      expect(coreHttp.get.mock.calls[0]).toEqual(['payment/payments/a%2Fb%3Fc%20d']);
    });

    it.each([
      { status: 401, code: 'UNAUTHORIZED' },
      { status: 404, code: 'NOT_FOUND' },
      { status: 409, code: 'BOOKING_NOT_HELD' },
      { status: 0, code: 'NETWORK_ERROR' },
    ])('lets $code through unchanged', async (error) => {
      coreHttp.get.mockRejectedValue(error);
      await expect(service.getPaymentPage('bk_1')).rejects.toBe(error);
    });
  });

  describe('startSnap', () => {
    it('posts no body to the snap path with only the idempotency key', async () => {
      const response = {
        data: {
          attemptId: 2,
          orderId: 'bk_1-2',
          method: null,
          snapToken: 'snap-2',
          redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-2',
          gatewayExpiresAt: '2026-11-14T10:50:00Z',
        },
        status: 201,
      };
      coreHttp.post.mockResolvedValue(response);
      await expect(service.startSnap('bk_1', 'key-1')).resolves.toBe(response);
      expect(coreHttp.post).toHaveBeenCalledTimes(1);
      expect(coreHttp.post.mock.calls[0]).toEqual([
        'payment/payments/bk_1/snap',
        undefined,
        { headers: { 'Idempotency-Key': 'key-1' } },
      ]);
      expect(coreHttp.post.mock.calls[0][1]).toBeUndefined();
      expect(coreHttp.get).not.toHaveBeenCalled();
    });

    it('encodes the booking id so it never changes the path shape', async () => {
      coreHttp.post.mockResolvedValue({ data: {}, status: 201 });
      await service.startSnap('a/b?c d', 'key-1');
      expect(coreHttp.post).toHaveBeenCalledWith('payment/payments/a%2Fb%3Fc%20d/snap', undefined, expect.anything());
    });

    it.each([
      { status: 401, code: 'UNAUTHORIZED' },
      { status: 404, code: 'NOT_FOUND' },
      { status: 409, code: 'BOOKING_NOT_HELD' },
      { status: 422, code: 'VALIDATION_FAILED' },
      { status: 503, code: 'PAYMENT_PROVIDER_BUSY' },
      { status: 0, code: 'TIMEOUT' },
    ])('lets $code through unchanged', async (error) => {
      coreHttp.post.mockRejectedValue(error);
      await expect(service.startSnap('bk_1', 'key-1')).rejects.toBe(error);
    });
  });

  describe('getPaymentStatus', () => {
    it('gets the status path with no config', async () => {
      const response = { data: { bookingStatus: 'PAID', paymentStatus: 'settled', serverNow: 'x' }, status: 200 };
      coreHttp.get.mockResolvedValue(response);
      await expect(service.getPaymentStatus('bk_1')).resolves.toBe(response);
      await service.getPaymentStatus('a/b');
      expect(coreHttp.get.mock.calls).toEqual([['payment/payments/bk_1/status'], ['payment/payments/a%2Fb/status']]);
      expect(coreHttp.post).not.toHaveBeenCalled();
    });

    it.each([
      { status: 401, code: 'UNAUTHORIZED' },
      { status: 404, code: 'NOT_FOUND' },
      { status: 503, code: 'SERVICE_UNAVAILABLE' },
    ])('lets $code through unchanged', async (error) => {
      coreHttp.get.mockRejectedValue(error);
      await expect(service.getPaymentStatus('bk_1')).rejects.toBe(error);
    });
  });
});
