import { errorCodeOf } from '@core/use_case/device/with-device-token';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export type LeaveQueueResult = { kind: 'left' };

export interface LeaveQueueUseCaseInterface {
  execute: (eventId: string) => Promise<LeaveQueueResult>;
}

type Deps = Pick<AwilixRegistry, 'queueService' | 'deviceTokenStore' | 'queuePlaceStore'>;

/** The place is already gone on the server (rejected token, unknown, missed, closed): there is nothing left to free. */
const ALREADY_GONE = new Set(['UNAUTHORIZED', 'NOT_FOUND', 'MISSED', 'EXPIRED', 'MOVED', 'QUEUE_CLOSED']);

/**
 * FR-04-W2 (W-9): give the number up on purpose, so the account can queue on another device. The server frees the
 * place, then this device forgets it; a later join gets a new number at the back. A network or server failure keeps
 * the place (the buyer can try again), and a claimed admission is not touched.
 */
export const LeaveQueueUseCase = ({
  queueService,
  deviceTokenStore,
  queuePlaceStore,
}: Deps): LeaveQueueUseCaseInterface => ({
  execute: async (eventId) => {
    const deviceToken = deviceTokenStore.get();
    const queueToken = queuePlaceStore.get(eventId)?.queueToken;
    if (deviceToken && queueToken) {
      try {
        await queueService.leaveQueue(eventId, deviceToken, queueToken);
      } catch (error) {
        if (!ALREADY_GONE.has(errorCodeOf(error) ?? '')) throw error;
      }
    }
    queuePlaceStore.remove(eventId);
    return { kind: 'left' };
  },
});
