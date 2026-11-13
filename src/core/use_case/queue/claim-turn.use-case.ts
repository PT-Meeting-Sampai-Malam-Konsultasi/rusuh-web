import type { Admission } from '@core/entities/queue/queue.entity';
import { errorCodeOf } from '@core/use_case/device/with-device-token';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export type ClaimTurnResult =
  | { kind: 'admitted'; admission: Admission }
  /** 401: claiming needs a session (ADR-0025); a guest signs in first. */
  | { kind: 'sign-in' }
  /** 409 NOT_YET or FULL: claim again after `afterMs`. */
  | { kind: 'retry'; afterMs: number }
  /** 409 NO_STOCK: every unit is reserved or held; back to waiting. */
  | { kind: 'paused' }
  /** 410 MISSED, EXPIRED or MOVED: the place is gone; queue again at the back. */
  | { kind: 'missed' }
  | { kind: 'sold-out' };

export type TurnWindowResult =
  | { kind: 'window'; turnExpiresAt: string; serverNow: string }
  /** The place has no turn window yet. */
  | { kind: 'waiting' }
  | { kind: 'missed' }
  | { kind: 'sold-out' };

export interface ClaimTurnUseCaseInterface {
  /** `jitter` (0–1) spreads the retries after FULL; by default the millisecond of the clock, which differs per device. */
  execute: (eventId: string, jitter?: number) => Promise<ClaimTurnResult>;
  /** When the 60 s turn window ends, for the countdown when the page was in the background. */
  turnWindow: (eventId: string) => Promise<TurnWindowResult>;
}

type Deps = Pick<AwilixRegistry, 'queueService' | 'deviceTokenStore' | 'queuePlaceStore' | 'admissionStore'>;

const GONE = new Set(['MISSED', 'EXPIRED', 'MOVED']);

/** FR-08: claim the turn and keep the admission token for the order page; classify every answer. */
export const ClaimTurnUseCase = ({
  queueService,
  deviceTokenStore,
  queuePlaceStore,
  admissionStore,
}: Deps): ClaimTurnUseCaseInterface => {
  const tokensFor = (eventId: string) => {
    const deviceToken = deviceTokenStore.get();
    const queueToken = queuePlaceStore.get(eventId)?.queueToken;
    return deviceToken && queueToken ? { deviceToken, queueToken } : null;
  };

  /** The place is gone for good: the next join starts at the back. */
  const forget = (eventId: string) => {
    queuePlaceStore.remove(eventId);
    return { kind: 'missed' } as const;
  };

  return {
    execute: async (eventId, jitter = (Date.now() % 1000) / 1000) => {
      const tokens = tokensFor(eventId);
      if (!tokens) return forget(eventId);
      try {
        const { data } = await queueService.claimTurn(eventId, tokens.deviceToken, tokens.queueToken);
        admissionStore.set(eventId, data.admissionToken);
        return { kind: 'admitted', admission: data };
      } catch (error) {
        const code = errorCodeOf(error);
        // The backend answers LOGIN_REQUIRED (CLAIM_REQUIRES_LOGIN); UNAUTHORIZED is a bad or ended session.
        if (code === 'LOGIN_REQUIRED' || code === 'UNAUTHORIZED') return { kind: 'sign-in' };
        if (code === 'NOT_YET') return { kind: 'retry', afterMs: 1000 };
        if (code === 'FULL') return { kind: 'retry', afterMs: Math.round(1000 + 1000 * jitter) };
        if (code === 'NO_STOCK') return { kind: 'paused' };
        if (code === 'QUEUE_CLOSED') return { kind: 'sold-out' };
        if (code && GONE.has(code)) return forget(eventId);
        throw error;
      }
    },

    turnWindow: async (eventId) => {
      const tokens = tokensFor(eventId);
      if (!tokens) return forget(eventId);
      try {
        const { data } = await queueService.getMyPlace(eventId, tokens.deviceToken, tokens.queueToken);
        return data.turnExpiresAt
          ? { kind: 'window', turnExpiresAt: data.turnExpiresAt, serverNow: data.serverNow }
          : { kind: 'waiting' };
      } catch (error) {
        const code = errorCodeOf(error);
        if (code === 'QUEUE_CLOSED') return { kind: 'sold-out' };
        if (code && GONE.has(code)) return forget(eventId);
        throw error;
      }
    },
  };
};
