import type { Frontier, QueuePlace } from '@core/entities/queue/queue.entity';
import type { HttpResponse } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

import { TURNSTILE_TOKEN_HEADER } from './device.service';

export const DEVICE_TOKEN_HEADER = 'X-Device-Token';

export interface QueueServiceInterface {
  /**
   * `POST /queue/{eventId}/join`: the place for this device (idempotent per device and event).
   * 409 ACCOUNT_HAS_PLACE_ELSEWHERE, 410 QUEUE_CLOSED, 404 NOT_FOUND, 401 for a rejected device token, 429.
   */
  joinQueue: (eventId: string, deviceToken: string, turnstileToken: string) => Promise<HttpResponse<QueuePlace>>;
  /** `GET /queue/{eventId}/frontier`: the public snapshot, cached 1 s at the CDN, so no token headers. 404 NOT_FOUND. */
  getFrontier: (eventId: string) => Promise<HttpResponse<Frontier>>;
}

export const QueueService = ({ queueHttp }: Pick<AwilixRegistry, 'queueHttp'>): QueueServiceInterface => ({
  joinQueue: (eventId, deviceToken, turnstileToken) =>
    queueHttp.post<QueuePlace>(`queue/${encodeURIComponent(eventId)}/join`, undefined, {
      headers: { [DEVICE_TOKEN_HEADER]: deviceToken, [TURNSTILE_TOKEN_HEADER]: turnstileToken },
    }),
  getFrontier: (eventId) => queueHttp.get<Frontier>(`queue/${encodeURIComponent(eventId)}/frontier`),
});
