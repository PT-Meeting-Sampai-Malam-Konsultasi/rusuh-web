import { http, HttpResponse, type HttpHandler } from 'msw';

import type { DeviceRegistration, QueuePlace } from '@core/entities/queue/queue.entity';

import { eventsFixture } from '../fixtures/events.fixture';
import { failure, problem, type MockContext } from './shared';

const DAY_MS = 86_400_000;
/** Pre-queue: numbers are drawn this long after the first join, so the countdown can be watched end to end. */
const PREQUEUE_MS = 9 * 60_000;
/** The HiFi's numbers: number 19.700 joins while 18.452 is served (1.248 ahead). */
const FIRST_SEQ = 19_700;
const SERVED_AT_JOIN = 18_452;
/** People let in per second while a sale runs (shows on a refresh until live updates arrive in FR-07). */
const ADMIT_PER_SECOND = 5;

const base64url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

interface MockPlace {
  seq: number | null;
  joinedAt: number;
  opensAt: number | null;
}

/**
 * The queue service as the waiting room sees it: device registration and an idempotent join per device and event.
 * Places live in this factory (the mock is the server), so a refresh keeps the same number.
 */
export function queueHandlers({ queueApiUrl, getScenario, now }: MockContext): HttpHandler[] {
  const places = new Map<string, MockPlace>();
  const nextSeq = new Map<string, number>();
  let devices = 0;

  const takeSeq = (eventId: string) => {
    const seq = nextSeq.get(eventId) ?? FIRST_SEQ;
    nextSeq.set(eventId, seq + 1);
    return seq;
  };

  return [
    http.post(`${queueApiUrl}/devices`, async ({ request }) => {
      const failed = await failure(getScenario());
      if (failed) return failed;
      if (!request.headers.get('X-Turnstile-Token')) return problem(400, 'VALIDATION_FAILED', 'Turnstile wajib');
      devices += 1;
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
      const today = now();
      const event = scenario === 'empty' ? undefined : eventsFixture(today).find((e) => e.eventId === eventId);
      // Coming-soon events have no queue yet (the room opens at waitingRoomOpensAt).
      if (!event || event.state === 'coming_soon') return problem(404, 'NOT_FOUND', 'Antrian tidak ditemukan');
      if (scenario === 'sold_out' || event.state === 'sold_out' || event.state === 'ended') {
        return problem(410, 'QUEUE_CLOSED', 'Antrian ditutup');
      }

      const key = `${device}|${eventId}`;
      const time = today.getTime();
      let place = places.get(key);
      if (!place) {
        const preopen = event.state === 'waiting_room_open';
        place = {
          seq: preopen ? null : takeSeq(eventId),
          joinedAt: time,
          opensAt: preopen ? time + PREQUEUE_MS : null,
        };
        places.set(key, place);
      }
      // The draw: once the room opens, the waiting device gets its number.
      if (place.seq === null && place.opensAt !== null && time >= place.opensAt) {
        place.seq = takeSeq(eventId);
        place.joinedAt = time;
      }

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
        const moved = Math.floor(((time - place.joinedAt) / 1000) * ADMIT_PER_SECOND);
        body.served = Math.min(place.seq - 1, SERVED_AT_JOIN + (place.seq - FIRST_SEQ) + moved);
        if (event.state === 'temporarily_full') body.state = 'paused';
      }
      return HttpResponse.json(body);
    }),
  ];
}
