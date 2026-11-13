import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export type EndOrderWindowResult = { kind: 'ended' };

export interface EndOrderWindowUseCaseInterface {
  /**
   * FR-18: the order window ran out before a hold. Forgets this event's admission token and stored queue place, so
   * the next waiting-room visit joins at the back (Q-26) instead of resuming a place that has ended.
   */
  execute: (eventId: string) => EndOrderWindowResult;
}

type Deps = Pick<AwilixRegistry, 'queuePlaceStore' | 'admissionStore'>;

/**
 * No API call: the queue's sweeper releases the admission and the stock (every 1 s), and joining again after an ended
 * place gives a new number at the back (openapi joinQueue). Safe to repeat.
 */
export const EndOrderWindowUseCase = ({ queuePlaceStore, admissionStore }: Deps): EndOrderWindowUseCaseInterface => ({
  execute: (eventId) => {
    admissionStore.set(eventId, null);
    queuePlaceStore.remove(eventId);
    return { kind: 'ended' };
  },
});
