import type { DeviceRegistration } from '@core/entities/queue/queue.entity';
import type { HttpResponse } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

/** Every Turnstile-gated call carries a fresh widget token in this header (single use). */
export const TURNSTILE_TOKEN_HEADER = 'X-Turnstile-Token';

export interface DeviceServiceInterface {
  /** `POST /queue/devices`: a signed device token for this browser, after a Turnstile check (ADR-0003). */
  registerDevice: (turnstileToken: string) => Promise<HttpResponse<DeviceRegistration>>;
}

export const DeviceService = ({ queueHttp }: Pick<AwilixRegistry, 'queueHttp'>): DeviceServiceInterface => ({
  registerDevice: (turnstileToken) =>
    queueHttp.post<DeviceRegistration>(
      'queue/devices',
      { platform: 'web' },
      { headers: { [TURNSTILE_TOKEN_HEADER]: turnstileToken } },
    ),
});
