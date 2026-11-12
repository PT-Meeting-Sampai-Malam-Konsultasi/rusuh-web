import type { Admission, Frontier, QueuePlace } from '@core/entities/queue/queue.entity';
import type { HttpResponse } from '@core/protocols/http.protocol';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

import { TURNSTILE_TOKEN_HEADER } from './device.service';

export const DEVICE_TOKEN_HEADER = 'X-Device-Token';
export const QUEUE_TOKEN_HEADER = 'X-Queue-Token';

export interface QueueServiceInterface {
  /**
   * `POST /queue/{eventId}/join`: the place for this device (idempotent per device and event).
   * 409 ACCOUNT_HAS_PLACE_ELSEWHERE, 410 QUEUE_CLOSED, 404 NOT_FOUND, 401 for a rejected device token, 429.
   */
  joinQueue: (eventId: string, deviceToken: string, turnstileToken: string) => Promise<HttpResponse<QueuePlace>>;
  /** `GET /queue/{eventId}/frontier`: the public snapshot, cached 1 s at the CDN, so no token headers. 404 NOT_FOUND. */
  getFrontier: (eventId: string) => Promise<HttpResponse<Frontier>>;
  /**
   * `POST /queue/{eventId}/claim`: the admission token, once `seq <= served`. Needs the session (ADR-0025); a repeat
   * returns the same admission. 401, 409 NOT_YET / FULL / NO_STOCK, 410 MISSED / EXPIRED / MOVED / QUEUE_CLOSED, 429.
   */
  claimTurn: (eventId: string, deviceToken: string, queueToken: string) => Promise<HttpResponse<Admission>>;
  /** `GET /queue/{eventId}/me`: this device's place, with `turnExpiresAt` from the turn on. 410 MISSED and the like. */
  getMyPlace: (eventId: string, deviceToken: string, queueToken: string) => Promise<HttpResponse<QueuePlace>>;
  /**
   * `DELETE /queue/{eventId}/me`: give the place up ("Keluar dari antrian", W-9). Idempotent: 204 also when the place
   * already ended; a claimed admission is not affected.
   */
  leaveQueue: (eventId: string, deviceToken: string, queueToken: string) => Promise<HttpResponse<void>>;
}

export const QueueService = ({ queueHttp }: Pick<AwilixRegistry, 'queueHttp'>): QueueServiceInterface => ({
  joinQueue: (eventId, deviceToken, turnstileToken) =>
    queueHttp.post<QueuePlace>(`queue/${encodeURIComponent(eventId)}/join`, undefined, {
      headers: { [DEVICE_TOKEN_HEADER]: deviceToken, [TURNSTILE_TOKEN_HEADER]: turnstileToken },
    }),
  getFrontier: (eventId) =>
    queueHttp.get<Frontier>(`queue/${encodeURIComponent(eventId)}/frontier`, { cacheable: true }),
  claimTurn: (eventId, deviceToken, queueToken) =>
    queueHttp.post<Admission>(`queue/${encodeURIComponent(eventId)}/claim`, undefined, {
      headers: { [DEVICE_TOKEN_HEADER]: deviceToken, [QUEUE_TOKEN_HEADER]: queueToken },
    }),
  getMyPlace: (eventId, deviceToken, queueToken) =>
    queueHttp.get<QueuePlace>(`queue/${encodeURIComponent(eventId)}/me`, {
      headers: { [DEVICE_TOKEN_HEADER]: deviceToken, [QUEUE_TOKEN_HEADER]: queueToken },
    }),
  leaveQueue: (eventId, deviceToken, queueToken) =>
    queueHttp.delete<void>(`queue/${encodeURIComponent(eventId)}/me`, {
      headers: { [DEVICE_TOKEN_HEADER]: deviceToken, [QUEUE_TOKEN_HEADER]: queueToken },
    }),
});
