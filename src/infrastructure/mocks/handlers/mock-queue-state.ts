import type { MockScenario } from '../scenario';

export const ORDER_WINDOW_MS = 5 * 60_000;
/** `?mock=short_window`: 15 s of the ink timer, pink from 1:00, then 0:00. */
export const MOCK_SHORT_ORDER_WINDOW_MS = 75_000;
/** Admission TTL: 60 s claim + 5 min order + 10 min payment (ADR-0021). */
export const ADMISSION_MS = 16 * 60_000;

/** The order window for the current scenario: the same on the queue (place ends) and the booking (expiresAt) side. */
export const orderWindowMs = (scenario: MockScenario) =>
  scenario === 'short_window' ? MOCK_SHORT_ORDER_WINDOW_MS : ORDER_WINDOW_MS;

/**
 * The mock is the server: its queue outlives a reload and is shared by the tabs, as a server would be (FR-10), so it is
 * kept in localStorage. Switching the placement scenario starts an event's queue over.
 */
const STATE_KEY = 'rusuh.mock.queue';

export interface MockPlace {
  seq: number | null;
  joinedAt: number;
  opensAt: number | null;
  /** Set by the first claim; a repeat returns the same admission. */
  admittedAt?: number;
}

/** One clock per event: `served` moves from the opening (or the first join) for every device alike. */
export interface MockQueue {
  opensAt: number | null;
  startedAt: number | null;
  /** The placement scenario this queue was started under (see `placementOf` in the queue mock). */
  placement?: string;
}

/** The mock queue service's data: one per createHandlers call, kept in localStorage `rusuh.mock.queue`. */
export interface MockQueueState {
  /** Key `${deviceToken}|${eventId}`. */
  places: Map<string, MockPlace>;
  nextSeq: Map<string, number>;
  queues: Map<string, MockQueue>;
  /** Devices registered so far (names the mock device tokens). */
  devices: number;
  persist: () => void;
  /** The latest `admittedAt` among this event's places, or null when none was claimed. */
  lastAdmittedAt: (eventId: string) => number | null;
}

interface SavedQueueState {
  places: [string, MockPlace][];
  nextSeq: [string, number][];
  queues?: [string, MockQueue][];
  devices: number;
}

const loadState = (): SavedQueueState | null => {
  try {
    const saved = globalThis.localStorage?.getItem(STATE_KEY);
    return saved ? (JSON.parse(saved) as SavedQueueState) : null;
  } catch {
    return null; // Storage blocked or unreadable: start an empty queue.
  }
};

const saveState = (state: SavedQueueState) => {
  try {
    globalThis.localStorage?.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: the queue lives until the next reload.
  }
};

/** Loads the saved mock queue (or an empty one); the queue and booking mocks of one createHandlers call share it. */
export function createMockQueueState(): MockQueueState {
  const saved = loadState();
  const state: MockQueueState = {
    places: new Map<string, MockPlace>(saved?.places),
    nextSeq: new Map<string, number>(saved?.nextSeq),
    queues: new Map<string, MockQueue>(saved?.queues),
    devices: saved?.devices ?? 0,
    persist: () =>
      saveState({
        places: [...state.places],
        nextSeq: [...state.nextSeq],
        queues: [...state.queues],
        devices: state.devices,
      }),
    lastAdmittedAt: (eventId) => {
      let latest: number | null = null;
      for (const [key, place] of state.places) {
        if (!key.endsWith(`|${eventId}`) || place.admittedAt === undefined) continue;
        if (latest === null || place.admittedAt > latest) latest = place.admittedAt;
      }
      return latest;
    },
  };
  return state;
}
