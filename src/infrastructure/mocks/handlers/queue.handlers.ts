import { http, HttpResponse, type HttpHandler } from 'msw';

import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { Admission, DeviceRegistration, Frontier, QueuePlace, QueueTurn } from '@core/entities/queue/queue.entity';

import { eventsFixture } from '../fixtures/events.fixture';
import { failure, problem, type MockContext } from './shared';

const DAY_MS = 86_400_000;
/** Pre-queue: numbers are drawn this long after the first join, so the countdown can be watched end to end. */
const PREQUEUE_MS = 9 * 60_000;
/** The HiFi's numbers: number 19.700 joins while 18.452 is served (1.248 ahead). */
const FIRST_SEQ = 19_700;
const SERVED_AT_JOIN = 18_452;
/** Every new number joins this many places back, as the first one does. */
const AHEAD_AT_JOIN = FIRST_SEQ - SERVED_AT_JOIN;
/** People let in per second while a sale runs: 300 a minute, so the first number's turn comes after about 4 minutes. */
const ADMIT_PER_SECOND = 5;
/** Devices this close to the front may stream (ADR-0015 default). */
const STREAM_FROM = 2000;
/** The turn window (FR-08). */
const TURN_MS = 60_000;
/** Admission TTL: 60 s claim + 5 min order + 10 min payment (ADR-0021). */
const ADMISSION_MS = 16 * 60_000;
/** The stream sends a frontier every controller tick. */
const TICK_MS = 1000;
/**
 * The mock is the server: its queue outlives a reload and is shared by the tabs, as a server would be (FR-10), so it is
 * kept in localStorage. Switching the placement scenario starts an event's queue over.
 */
const STATE_KEY = 'rusuh.mock.queue';

const base64url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

interface MockPlace {
  seq: number | null;
  joinedAt: number;
  opensAt: number | null;
  /** Set by the first claim; a repeat returns the same admission. */
  admittedAt?: number;
}

/** One clock per event: `served` moves from the opening (or the first join) for every device alike. */
interface MockQueue {
  opensAt: number | null;
  startedAt: number | null;
  /** The placement scenario this queue was started under (see `placementOf`). */
  placement?: string;
}

interface MockQueueState {
  places: [string, MockPlace][];
  nextSeq: [string, number][];
  queues?: [string, MockQueue][];
  devices: number;
}

const loadState = (): MockQueueState | null => {
  try {
    const saved = globalThis.localStorage?.getItem(STATE_KEY);
    return saved ? (JSON.parse(saved) as MockQueueState) : null;
  } catch {
    return null; // Storage blocked or unreadable: start an empty queue.
  }
};

const saveState = (state: MockQueueState) => {
  try {
    globalThis.localStorage?.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: the queue lives until the next reload.
  }
};

const sse = (event: string, data: object, id?: number) =>
  `event: ${event}\n${id === undefined ? '' : `id: ${id}\n`}data: ${JSON.stringify(data)}\n\n`;

/**
 * The queue service as the waiting room sees it: device registration, an idempotent join per device and event, the
 * public frontier and the stream near the front. Kept across reloads and tabs (see STATE_KEY), so the number stays.
 */
export function queueHandlers({ queueApiUrl, getScenario, now }: MockContext): HttpHandler[] {
  const saved = loadState();
  const places = new Map<string, MockPlace>(saved?.places);
  const nextSeq = new Map<string, number>(saved?.nextSeq);
  const queues = new Map<string, MockQueue>(saved?.queues);
  let devices = saved?.devices ?? 0;
  const persist = () => saveState({ places: [...places], nextSeq: [...nextSeq], queues: [...queues], devices });

  /** Where new numbers land: `no_queue` nobody ahead, `near_front` 20 places back, `far_back` 12.000, `ok` 1.248;
   *  null for scenarios that don't say (`stream_off`, `slow`…), which keep the running queue's placement. */
  const placementOf = () => {
    const scenario = getScenario();
    return ['ok', 'near_front', 'far_back', 'no_queue'].includes(scenario) ? scenario : null;
  };

  const queueOf = (eventId: string) => {
    let queue = queues.get(eventId);
    if (!queue) {
      queue = { opensAt: null, startedAt: null, placement: placementOf() ?? 'ok' };
      queues.set(eventId, queue);
    }
    return queue;
  };

  /** Switching `?mock=` between placements starts that event's queue over, so the new scenario shows at once. */
  const restartOnNewPlacement = (eventId: string) => {
    const queue = queues.get(eventId);
    const placement = placementOf();
    if (!queue || !placement || (queue.placement ?? 'ok') === placement) return;
    queues.delete(eventId);
    nextSeq.delete(eventId);
    for (const key of [...places.keys()]) if (key.endsWith(`|${eventId}`)) places.delete(key);
  };

  /** Where the line would be with a crowd behind the mock devices. */
  const rawServed = (eventId: string, time: number) => {
    const startedAt = queues.get(eventId)?.startedAt;
    if (startedAt == null) return SERVED_AT_JOIN;
    return SERVED_AT_JOIN + Math.floor(((time - startedAt) / 1000) * ADMIT_PER_SECOND);
  };

  /** A new number joins 1.248 places back, behind every number handed out before it. */
  const takeSeq = (eventId: string, time: number) => {
    queueOf(eventId).startedAt ??= time;
    // `near_front`: 20 places back, so the turn comes in about 4 s; `far_back`: 12.000 back, a long wait.
    const placement = placementOf() ?? queueOf(eventId).placement;
    const ahead = { near_front: 20, far_back: 12_000, no_queue: 0 }[placement as string] ?? AHEAD_AT_JOIN;
    const seq = Math.max(nextSeq.get(eventId) ?? SERVED_AT_JOIN + ahead, rawServed(eventId, time) + ahead);
    nextSeq.set(eventId, seq + 1);
    return seq;
  };

  /** Never past the newest number handed out: the turn comes to each mock device in order. */
  const servedAt = (eventId: string, time: number, paused: boolean) =>
    paused ? SERVED_AT_JOIN : Math.min((nextSeq.get(eventId) ?? FIRST_SEQ) - 1, rawServed(eventId, time));

  /** When `served` reaches this number, and when its 60 s window ends. */
  const turnOf = (eventId: string, seq: number) => {
    const startedAt = queues.get(eventId)?.startedAt ?? 0;
    const at = startedAt + Math.ceil(((seq - SERVED_AT_JOIN) / ADMIT_PER_SECOND) * 1000);
    return { at, expiresAt: at + TURN_MS };
  };

  /** The draw: once the room opens, a waiting place gets its number; the line starts moving at the opening. */
  const draw = (eventId: string, place: MockPlace, time: number) => {
    if (place.seq !== null || place.opensAt === null || time < place.opensAt) return;
    place.seq = takeSeq(eventId, place.opensAt);
    place.joinedAt = time;
  };

  /** A turn that passed its window without a claim: the place is gone (MISSED). */
  const missed = (eventId: string, place: MockPlace, time: number) =>
    place.seq !== null && place.admittedAt === undefined && time > turnOf(eventId, place.seq).expiresAt;

  /** The place of the device and queue tokens on a request, or a problem response. */
  const placeFor = (request: Request, eventId: string) => {
    const device = request.headers.get('X-Device-Token');
    if (!device || !request.headers.get('X-Queue-Token')) {
      return { error: problem(401, 'UNAUTHORIZED', 'Token antrian tidak ada') };
    }
    restartOnNewPlacement(eventId);
    const key = `${device}|${eventId}`;
    const place = places.get(key);
    if (!findEvent(eventId) || !place) return { error: problem(404, 'NOT_FOUND', 'Antrian tidak ditemukan') };
    return { key, place };
  };

  const findEvent = (eventId: string) =>
    getScenario() === 'empty' ? undefined : eventsFixture(now()).find((e) => e.eventId === eventId);

  const frontierOf = (event: EventSummary, time: number): Frontier => {
    const queue = queues.get(event.eventId);
    const paused = event.state === 'temporarily_full';
    const frontier: Frontier = {
      event: event.eventId,
      state: 'open',
      served: servedAt(event.eventId, time, paused),
      ratePerMin: paused ? 0 : ADMIT_PER_SECOND * 60,
      rateLow: paused ? 0 : ADMIT_PER_SECOND * 48,
      rateHigh: paused ? 0 : ADMIT_PER_SECOND * 72,
      rateSource: 'measured',
      streamFrom: getScenario() === 'stream_off' ? 0 : STREAM_FROM,
      ts: Math.floor(time / 1000),
    };
    if (paused) Object.assign(frontier, { state: 'paused', reason: 'stock' });
    if (event.state === 'sold_out' || event.state === 'ended') {
      Object.assign(frontier, { state: 'closed', reason: event.state });
    }
    if (event.state === 'waiting_room_open' && (queue?.opensAt == null || time < queue.opensAt)) {
      frontier.state = 'preopen';
      if (queue?.opensAt != null) frontier.opensAt = Math.floor(queue.opensAt / 1000);
    }
    return frontier;
  };

  return [
    http.post(`${queueApiUrl}/queue/devices`, async ({ request }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      if (!request.headers.get('X-Turnstile-Token')) return problem(400, 'VALIDATION_FAILED', 'Turnstile wajib');
      devices += 1;
      persist();
      const issued = now().getTime();
      const expiresAt = new Date(issued + 30 * DAY_MS).toISOString();
      const payload = {
        iss: 'rusuh-queue',
        sub: `w_mock${devices}`,
        plat: 'web',
        exp: Math.floor(issued / 1000) + 2_592_000,
      };
      const deviceToken = `${base64url({ alg: 'EdDSA', typ: 'device+jwt' })}.${base64url(payload)}.mock`;
      return HttpResponse.json<DeviceRegistration>({ deviceToken, expiresAt }, { status: 201 });
    }),

    http.post(`${queueApiUrl}/queue/:eventId/join`, async ({ request, params }) => {
      const scenario = getScenario();
      const failed = await failure(scenario);
      if (failed) return failed;
      const device = request.headers.get('X-Device-Token');
      if (!device) return problem(401, 'UNAUTHORIZED', 'Perangkat belum terdaftar');
      if (!request.headers.get('X-Turnstile-Token')) return problem(400, 'VALIDATION_FAILED', 'Turnstile wajib');

      const eventId = String(params.eventId);
      const event = findEvent(eventId);
      // Coming-soon events have no queue yet (the room opens at waitingRoomOpensAt).
      if (!event || event.state === 'coming_soon') return problem(404, 'NOT_FOUND', 'Antrian tidak ditemukan');
      if (scenario === 'sold_out' || event.state === 'sold_out' || event.state === 'ended') {
        return problem(410, 'QUEUE_CLOSED', 'Antrian ditutup');
      }

      const key = `${device}|${eventId}`;
      const today = now();
      const time = today.getTime();
      restartOnNewPlacement(eventId);
      let place = places.get(key);
      // After a missed turn, joining again gives a new number at the back.
      if (place && missed(eventId, place, time)) place = undefined;
      if (!place) {
        const queue = queueOf(eventId);
        const preopen = event.state === 'waiting_room_open' && (queue.opensAt === null || time < queue.opensAt);
        if (preopen) queue.opensAt ??= time + PREQUEUE_MS;
        place = {
          seq: preopen ? null : takeSeq(eventId, time),
          joinedAt: time,
          opensAt: preopen ? queue.opensAt : null,
        };
        places.set(key, place);
      }
      draw(eventId, place, time);
      persist();

      const body: QueuePlace = {
        eventId,
        state: 'open',
        seq: place.seq,
        serverNow: today.toISOString(),
        queueToken: `mock-queue.${eventId}.${place.seq ?? 'pre'}`,
      };
      if (place.seq === null) {
        body.state = 'preopen';
        body.opensAt = new Date(place.opensAt ?? time).toISOString();
      } else {
        const frontier = frontierOf(event, time);
        body.served = frontier.served;
        if (frontier.state === 'paused') body.state = 'paused';
      }
      return HttpResponse.json(body);
    }),

    http.get(`${queueApiUrl}/queue/:eventId/frontier`, async ({ params }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      const event = findEvent(String(params.eventId));
      if (!event || event.state === 'coming_soon') return problem(404, 'NOT_FOUND', 'Antrian tidak ditemukan');
      return HttpResponse.json(frontierOf(event, now().getTime()), {
        headers: { 'Cache-Control': 'public, max-age=1' },
      });
    }),

    http.get(`${queueApiUrl}/queue/:eventId/stream`, async ({ request, params }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      const device = request.headers.get('X-Device-Token');
      if (!device || !request.headers.get('X-Queue-Token')) {
        return problem(401, 'UNAUTHORIZED', 'Token antrian tidak ada');
      }
      const eventId = String(params.eventId);
      const event = findEvent(eventId);
      const place = places.get(`${device}|${eventId}`);
      if (!event || !place || place.seq === null) return problem(404, 'NOT_FOUND', 'Antrian tidak ditemukan');
      const { seq } = place;
      const first = frontierOf(event, now().getTime());
      if (first.state === 'closed') return problem(410, 'QUEUE_CLOSED', 'Antrian ditutup');
      if (!first.streamFrom || seq - first.served > first.streamFrom) {
        return problem(409, 'TOO_FAR', 'Posisi masih jauh dari depan');
      }

      const encoder = new TextEncoder();
      let timer: ReturnType<typeof setInterval> | undefined;
      let turnSent = false;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const tick = () => {
            const time = now().getTime();
            const frontier = frontierOf(event, time);
            controller.enqueue(encoder.encode(sse('frontier', frontier, frontier.ts)));
            if (!turnSent && frontier.served >= seq) {
              turnSent = true;
              const turn: QueueTurn = {
                event: eventId,
                seq,
                served: frontier.served,
                turnExpiresAt: new Date(turnOf(eventId, seq).expiresAt).toISOString(),
                serverNow: new Date(time).toISOString(),
              };
              controller.enqueue(encoder.encode(sse('turn', turn)));
            }
          };
          controller.enqueue(encoder.encode('retry: 3000\n\n'));
          tick();
          timer = setInterval(tick, TICK_MS);
        },
        cancel() {
          clearInterval(timer);
        },
      });
      return new HttpResponse(body, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform' },
      });
    }),

    http.get(`${queueApiUrl}/queue/:eventId/me`, async ({ request, params }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      const eventId = String(params.eventId);
      const found = placeFor(request, eventId);
      if (found.error) return found.error;
      const { key, place } = found;
      const time = now().getTime();
      if (missed(eventId, place, time)) {
        places.delete(key);
        persist();
        return problem(410, 'MISSED', 'Giliran terlewat');
      }
      draw(eventId, place, time);
      persist();
      const event = findEvent(eventId) as EventSummary;
      const frontier = frontierOf(event, time);
      const body: QueuePlace = {
        eventId,
        state: place.seq === null ? 'preopen' : frontier.state,
        ...(place.seq === null && place.opensAt !== null ? { opensAt: new Date(place.opensAt).toISOString() } : {}),
        seq: place.seq,
        served: frontier.served,
        serverNow: new Date(time).toISOString(),
        queueToken: `mock-queue.${eventId}.${place.seq ?? 'pre'}`,
        turnExpiresAt:
          place.seq !== null && frontier.served >= place.seq
            ? new Date(turnOf(eventId, place.seq).expiresAt).toISOString()
            : null,
      };
      return HttpResponse.json(body);
    }),

    // FR-04-W2: "Keluar dari antrian". Idempotent like the API: 204 also when the place is already gone.
    http.delete(`${queueApiUrl}/queue/:eventId/me`, async ({ request, params }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      const device = request.headers.get('X-Device-Token');
      if (!device || !request.headers.get('X-Queue-Token')) {
        return problem(401, 'UNAUTHORIZED', 'Token antrian tidak ada');
      }
      places.delete(`${device}|${String(params.eventId)}`);
      persist();
      return new HttpResponse(null, { status: 204 });
    }),

    http.post(`${queueApiUrl}/queue/:eventId/claim`, async ({ request, params }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      // A JWT session is required (ADR-0025): a guest signs in first.
      if (!request.headers.get('Authorization')) return problem(401, 'UNAUTHORIZED', 'Silakan masuk dulu');
      const eventId = String(params.eventId);
      const found = placeFor(request, eventId);
      if (found.error) return found.error;
      const { key, place } = found;
      const time = now().getTime();
      if (place.seq === null) return problem(409, 'NOT_YET', 'Belum giliran Anda');
      if (missed(eventId, place, time)) {
        places.delete(key);
        persist();
        return problem(410, 'MISSED', 'Giliran terlewat');
      }
      if (time < turnOf(eventId, place.seq).at) return problem(409, 'NOT_YET', 'Belum giliran Anda');
      place.admittedAt ??= time;
      persist();
      return HttpResponse.json<Admission>({
        admissionToken: `mock-admission.${eventId}.${place.seq}`,
        slotId: `s_mock${place.seq}`,
        maxTickets: 3,
        expiresAt: new Date(place.admittedAt + ADMISSION_MS).toISOString(),
        serverNow: new Date(time).toISOString(),
      });
    }),
  ];
}
