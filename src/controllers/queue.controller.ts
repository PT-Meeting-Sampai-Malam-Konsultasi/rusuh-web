import { useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';

import type { HttpError } from '@core/protocols/http.protocol';
import type { HomeEvents } from '@core/use_case/catalog/get-home-events.use-case';
import {
  applyFrontier,
  canStream,
  pollDelayMs,
  streamRetryDelayMs,
  type FrontierResult,
} from '@core/use_case/queue/follow-queue.use-case';
import type { JoinQueueResult } from '@core/use_case/queue/join-queue.use-case';
import { holdWaitEstimate, waitEstimate, type WaitEstimate } from '@core/use_case/queue/wait-estimate';
import type { ClaimTurnResult, TurnWindowResult } from '@core/use_case/queue/claim-turn.use-case';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import { QUERY_KEYS } from '@utils/constants/query-keys';
import { ROUTES } from '@utils/constants/routes';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';
import {
  DEFAULT_TIME_ZONE,
  formatEventDate,
  formatPosterDate,
  formatTime,
  zoneAbbr,
  type FormatLocale,
} from '@utils/format/date';
import { posterToneFor, type PosterTone } from '@utils/format/event-card';
import { formatCount } from '@utils/format/number';
import { findHomeEvent, formatCountdown, queueStatusFor, type QueueStatus } from '@utils/format/queue';
import { mainNav, type NavItem } from '@utils/navigation';

export type { QueueStatus } from '@utils/format/queue';

/** The event beside the queue: poster on desktop, banner on phones. */
export interface QueueEventView {
  name: string;
  subtitle?: string;
  imageUrl?: string;
  posterTone: PosterTone;
  posterDate: string;
  posterPlace: string;
  dateLine: string;
  venueLine: string;
  /** "LIVE · Antrian dibuka", "Antrian dibuka 10.00 WIB", "Antrian dijeda" or "Antrian ditutup". */
  kicker: string;
}

export interface QueueWaitingView {
  /** "1.248": places ahead plus one, never below 1 (the turn itself is FR-08). */
  position: string;
  /** 0–100: how far the line moved since the buyer joined. */
  progress: number;
  served: string;
  seq: string;
  /** "Diperbarui 3 detik lalu": time since the newest frontier (or the join answer). */
  updated: string;
  /** "300 orang masuk / menit", or null before there is a rate. */
  rate: string | null;
  /** "± 4–6 menit lagi", "± 4 menit lagi" or "kurang dari 1 menit lagi"; null without a speed (FR-09). */
  eta: string | null;
}

export interface QueuePrequeueView {
  /** "8:42", "3:08:42" or "7 hari 21 jam". */
  countdown: string;
  /** "10.00 WIB". */
  opensAt: string;
}

export interface QueuePausedView {
  position: string | null;
  /** Why the line stopped: stock coming back, or the organiser checking. */
  reason: string;
}

export interface QueueTurnView {
  /** "19.700": "Nomor 19.700, silakan masuk." */
  seq: string;
  /** Seconds left in the 60 s window, or null until it is known. */
  seconds: number | null;
  /** The claim is on its way (signed in, page in front). */
  claiming: boolean;
  /** Guest: where "Masuk untuk lanjut" goes (claiming needs a session, ADR-0025); null when signed in. */
  signInHref: string | null;
}

export interface QueueControllerInterface {
  t: TFunction;
  status: QueueStatus;
  event: QueueEventView | null;
  waiting: QueueWaitingView | null;
  prequeue: QueuePrequeueView | null;
  paused: QueuePausedView | null;
  turn: QueueTurnView | null;
  /** "Pilih tiket sekarang": claim at once. */
  claimNow: () => void;
  /** "Antre lagi" after a missed turn: a new number at the back. */
  queueAgain: () => void;
  /** Translated; '' unless status is 'error'. */
  errorMessage: string;
  retry: () => void;
  locale: FormatLocale;
  setLocale: (locale: FormatLocale) => void;
  nav: NavItem[];
  homeHref: string;
}

type QueueControllerDeps = Pick<
  AwilixRegistry,
  | 'joinQueueUseCase'
  | 'followQueueUseCase'
  | 'claimTurnUseCase'
  | 'getHomeEventsUseCase'
  | 'analyticsAdapter'
  | 'storage'
  | 'ERROR_CODE_MAP'
  | 'useTranslation'
  | 'useQueryTanstack'
  | 'useQueryClientTanstack'
  | 'useSearchParamsNext'
  | 'useRouterNext'
  | 'usePageVisible'
>;

/** Same query as Home, so arriving from Home shows the poster at once. */
const EVENTS_STALE_MS = 5_000;

const QueueController = ({
  joinQueueUseCase,
  followQueueUseCase,
  claimTurnUseCase,
  getHomeEventsUseCase,
  analyticsAdapter,
  storage,
  ERROR_CODE_MAP,
  useTranslation,
  useQueryTanstack,
  useQueryClientTanstack,
  useSearchParamsNext,
  useRouterNext,
  usePageVisible,
}: QueueControllerDeps): QueueControllerInterface => {
  const { t, i18n } = useTranslation();
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'id';
  const eventId = useSearchParamsNext().get('event')?.trim() ?? '';
  const hasEventId = eventId !== '';

  useEffect(() => {
    analyticsAdapter.trackPageView('queue');
  }, [analyticsAdapter]);

  const eventsQuery = useQueryTanstack<HomeEvents, HttpError>({
    queryKey: [QUERY_KEYS.EVENTS],
    queryFn: () => getHomeEventsUseCase.execute(),
    enabled: hasEventId,
    staleTime: EVENTS_STALE_MS,
  });

  // One join per visit. A refresh or a new tab resumes the stored place (FR-10); "Antre lagi" marks the next one as a
  // real rejoin at the back.
  const rejoinNext = useRef(false);
  const joinQuery = useQueryTanstack<JoinQueueResult, HttpError>({
    queryKey: [QUERY_KEYS.QUEUE_PLACE, eventId],
    queryFn: () => {
      const rejoin = rejoinNext.current;
      rejoinNext.current = false;
      return joinQueueUseCase.execute(eventId, { rejoin });
    },
    enabled: hasEventId,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const queryClient = useQueryClientTanstack();
  const result = joinQuery.data;
  const joined = result?.kind === 'joined' ? result.place : null;

  // FR-07: after the join, follow the line by polling the frontier; near the front the stream takes over (ADR-0015).
  const [streaming, setStreaming] = useState(false);
  const [fellBack, setFellBack] = useState(false);
  const [streamRetryAt, setStreamRetryAt] = useState(0);
  const connectFailures = useRef(0);
  const following = !!joined && joined.seq !== null;

  const frontierQuery = useQueryTanstack<FrontierResult, HttpError>({
    queryKey: [QUERY_KEYS.QUEUE_FRONTIER, eventId],
    queryFn: () => followQueueUseCase.poll(eventId),
    enabled: hasEventId && following && !streaming,
    // From the newest answer: the interval follows the position, and polling stops at the turn or when closed.
    refetchInterval: (query) => {
      const data = query.state.data;
      const next = joined ? applyFrontier(joined, data?.kind === 'frontier' ? data.frontier : null) : null;
      const active = !!next && (next.state === 'open' || next.state === 'paused') && !next.turnReached;
      // Jitter fixed per answer (its arrival millisecond): a new random number on every render would restart the
      // timer each second, while the clock below re-renders, and the poll would never fire.
      const jitter = (query.state.dataUpdatedAt % 1000) / 1000;
      return active ? pollDelayMs(next.position, jitter, fellBack) : false;
    },
    retry: false,
    gcTime: 0,
  });
  const frontier = frontierQuery.data?.kind === 'frontier' ? frontierQuery.data.frontier : null;
  const place = joined ? applyFrontier(joined, frontier) : null;
  const live = following && !!place && (place.state === 'open' || place.state === 'paused') && !place.turnReached;
  const baseStatus = queueStatusFor(
    hasEventId,
    place && result?.kind === 'joined' ? { ...result, place } : result,
    joinQuery.isError,
  );

  // FR-08: at the turn, claim while the page is in front (a background tab waits; the buyer has 60 s to come back).
  // Both queries are keyed by the number, so "Antre lagi" starts clean with the new one.
  const router = useRouterNext();
  const visible = usePageVisible();
  const atTurn = !!place?.turnReached && place.state === 'open';
  // FR-05: the join answer itself is at the turn, so there is no queue: straight on, no turn screen or 60 s timer.
  const skipping =
    joined?.state === 'open' && joined.seq !== null && joined.served !== null && joined.served >= joined.seq;
  const signInHref = `${ROUTES.LOGIN}?next=${encodeURIComponent(`${ROUTES.QUEUE}?event=${eventId}`)}`;
  const windowQuery = useQueryTanstack<TurnWindowResult, HttpError>({
    queryKey: [QUERY_KEYS.QUEUE_TURN, eventId, place?.seq],
    queryFn: () => claimTurnUseCase.turnWindow(eventId),
    enabled: atTurn && !skipping,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const claimQuery = useQueryTanstack<ClaimTurnResult, HttpError>({
    queryKey: [QUERY_KEYS.QUEUE_CLAIM, eventId, place?.seq],
    queryFn: () => claimTurnUseCase.execute(eventId),
    enabled: atTurn && visible,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (query.state.data?.kind === 'retry' ? query.state.data.afterMs : false),
  });
  const claim = claimQuery.data;
  const turnWindow = windowQuery.data;
  const summary = findHomeEvent(eventsQuery.data, eventId);

  const trackedFor = useRef<JoinQueueResult | null>(null);
  useEffect(() => {
    if (!result || trackedFor.current === result) return;
    trackedFor.current = result;
    analyticsAdapter.trackEvent('queue_join', {
      eventId,
      outcome: result.kind === 'joined' && result.resumed ? 'resumed' : result.kind,
      state: result.kind === 'joined' ? result.place.state : 'none',
    });
  }, [result, analyticsAdapter, eventId]);

  // One clock for the pre-queue countdown, "Diperbarui n detik lalu" and the stream retry: elapsed time only, never a
  // deadline against the device clock.
  const [now, setNow] = useState(() => Date.now());
  const ticking = baseStatus === 'prequeue' || live || atTurn;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  // The 60 s window: server times plus the time since that answer, never the device clock alone.
  const turnSeconds =
    turnWindow?.kind === 'window'
      ? Math.max(
          0,
          (Date.parse(turnWindow.turnExpiresAt) - Date.parse(turnWindow.serverNow)) / 1000 -
            (now - windowQuery.dataUpdatedAt) / 1000,
        )
      : null;
  const admitted = claim?.kind === 'admitted';
  const status = ((): QueueStatus => {
    if (claim?.kind === 'sold-out' || turnWindow?.kind === 'sold-out') return 'sold-out';
    if (!atTurn) return baseStatus;
    if (claim?.kind === 'missed' || turnWindow?.kind === 'missed' || (turnSeconds === 0 && !admitted)) return 'missed';
    if (claim?.kind === 'paused') return 'paused';
    return skipping ? 'entering' : 'turn';
  })();

  // No queue and no session: sign in first (claiming needs it, ADR-0025); back here, the claim goes through.
  useEffect(() => {
    if (skipping && claim?.kind === 'sign-in') router.replace(signInHref);
  }, [skipping, claim, router, signInHref]);

  const skipTracked = useRef(false);
  useEffect(() => {
    if (!skipping || skipTracked.current) return;
    skipTracked.current = true;
    analyticsAdapter.trackEvent('queue_skip', { eventId });
  }, [skipping, analyticsAdapter, eventId]);

  // Admitted: on to the order page, with the admission token kept in memory for it (replace: Back must not reclaim).
  useEffect(() => {
    if (claim?.kind !== 'admitted') return;
    analyticsAdapter.trackEvent('queue_claim', { eventId, outcome: 'admitted' });
    router.replace(`${ROUTES.ORDER}?event=${encodeURIComponent(eventId)}`);
  }, [claim, analyticsAdapter, eventId, router]);

  const claimedOutcome = claim && claim.kind !== 'admitted' && claim.kind !== 'retry' ? claim.kind : null;
  useEffect(() => {
    if (claimedOutcome) analyticsAdapter.trackEvent('queue_claim', { eventId, outcome: claimedOutcome });
  }, [claimedOutcome, analyticsAdapter, eventId]);

  // Near the front: stream instead of polling while it is healthy; on a failure, poll and try again later.
  const wantStream = live && canStream(place?.position ?? null, frontier?.streamFrom) && now >= streamRetryAt;
  useEffect(() => {
    if (!wantStream) return;
    const retryLater = (event: Parameters<typeof streamRetryDelayMs>[0]) => {
      setStreaming(false);
      setStreamRetryAt(Date.now() + streamRetryDelayMs(event, connectFailures.current));
      analyticsAdapter.trackEvent('queue_stream', { eventId, outcome: event });
    };
    const close = followQueueUseCase.stream(eventId, {
      onFrontier: (next) => {
        connectFailures.current = 0;
        setStreaming(true);
        setFellBack(false);
        const data: FrontierResult = { kind: 'frontier', frontier: next };
        queryClient.setQueryData([QUERY_KEYS.QUEUE_FRONTIER, eventId], data);
      },
      // The turn screen and the claim are FR-08; the frontier sent with it already moves the place to the front.
      onTurn: () => undefined,
      onFallback: (reason) => {
        if (reason === 'connect_failed') connectFailures.current += 1;
        setFellBack(true);
        retryLater(reason);
      },
      onClose: () => retryLater('closed'),
    });
    if (!close) return;
    analyticsAdapter.trackEvent('queue_stream', { eventId, outcome: 'open' });
    return () => {
      close();
      setStreaming(false);
    };
  }, [wantStream, eventId, followQueueUseCase, queryClient, analyticsAdapter]);
  const secondsToOpen =
    status === 'prequeue' && place?.opensAt
      ? Math.max(
          0,
          (Date.parse(place.opensAt) - Date.parse(place.serverNow)) / 1000 - (now - joinQuery.dataUpdatedAt) / 1000,
        )
      : null;

  // When the countdown ends, ask once more: the place now has its number from the draw.
  const refetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (secondsToOpen !== 0 || !place?.opensAt || refetchedFor.current === place.opensAt) return;
    refetchedFor.current = place.opensAt;
    void joinQuery.refetch();
  }, [secondsToOpen, place?.opensAt, joinQuery]);

  const timeZone = summary?.timezone ?? DEFAULT_TIME_ZONE;
  const opensAtLabel = place?.opensAt ? `${formatTime(place.opensAt, locale, timeZone)} ${zoneAbbr(timeZone)}` : '';

  const event = useMemo((): QueueEventView | null => {
    if (!summary) return null;
    const kickers: Partial<Record<QueueStatus, string>> = {
      waiting: t('queue_kicker_open'),
      turn: t('queue_kicker_open'),
      missed: t('queue_kicker_open'),
      entering: t('queue_kicker_open'),
      prequeue: opensAtLabel ? t('queue_kicker_prequeue', { time: opensAtLabel }) : t('queue_kicker_open'),
      paused: t('queue_kicker_paused'),
      'sold-out': t('queue_kicker_closed'),
    };
    return {
      name: summary.name,
      subtitle: summary.subtitle,
      imageUrl: summary.imageUrl,
      posterTone: posterToneFor(summary.eventId),
      posterDate: formatPosterDate(summary.startsAt, timeZone),
      posterPlace: [summary.venueShort ?? summary.venue, summary.city].filter(Boolean).join(' · ').toUpperCase(),
      dateLine: formatEventDate(summary.startsAt, locale, timeZone),
      venueLine: [summary.venue, summary.city].filter(Boolean).join(', '),
      kicker: kickers[status] ?? t('queue_title'),
    };
  }, [summary, status, t, locale, timeZone, opensAtLabel]);

  const position = place?.position ?? null;

  const updatedAt = Math.max(frontierQuery.dataUpdatedAt, joinQuery.dataUpdatedAt);
  const secondsAgo = Math.max(0, Math.floor((now - updatedAt) / 1000));
  const rate = frontier?.ratePerMin ?? 0;

  // FR-09: the range only goes down; held per number, so "Antre lagi" starts fresh. Holding twice gives the same
  // answer, so a repeated render is harmless.
  const shownEta = useRef<{ seq: number | null; estimate: WaitEstimate | null }>({ seq: null, estimate: null });
  const nextEta =
    status === 'waiting' && place ? waitEstimate(place.position, frontier?.rateLow, frontier?.rateHigh) : null;
  const previousEta = shownEta.current.seq === (place?.seq ?? null) ? shownEta.current.estimate : null;
  const eta = holdWaitEstimate(previousEta, nextEta);
  shownEta.current = { seq: place?.seq ?? null, estimate: eta };
  const etaText = !eta
    ? null
    : eta.kind === 'soon'
      ? t('queue_eta_soon')
      : eta.low === eta.high
        ? t('queue_eta_single', { minutes: eta.low })
        : t('queue_eta_range', { low: eta.low, high: eta.high });

  const waiting = useMemo((): QueueWaitingView | null => {
    if (status !== 'waiting' || !place || place.seq === null || place.served === null) return null;
    return {
      position: formatCount(place.position ?? 1, locale),
      progress: place.progress,
      served: formatCount(place.served, locale),
      seq: formatCount(place.seq, locale),
      updated: secondsAgo < 1 ? t('queue_updated_now') : t('queue_updated', { seconds: secondsAgo }),
      rate: rate > 0 ? t('queue_rate', { rate: formatCount(rate, locale) }) : null,
      eta: etaText,
    };
  }, [status, place, locale, secondsAgo, rate, t, etaText]);

  const pausedReasons: Partial<Record<string, string>> = {
    stock: t('home_temporarily_full_note'),
    operator: t('queue_paused_operator'),
  };

  const errorCode = joinQuery.error?.code;
  const errorMessage =
    status === 'error' && errorCode ? t(ERROR_CODE_MAP[errorCode] ?? ERROR_CODE_MAP.UNKNOWN_ERROR) : '';

  return {
    t,
    status,
    event,
    waiting,
    prequeue: secondsToOpen !== null ? { countdown: formatCountdown(secondsToOpen, t), opensAt: opensAtLabel } : null,
    paused:
      status === 'paused'
        ? {
            position: position !== null ? formatCount(position, locale) : null,
            reason:
              pausedReasons[frontier?.reason ?? ''] ??
              (summary?.state === 'temporarily_full' ? t('home_temporarily_full_note') : t('queue_paused_operator')),
          }
        : null,
    turn:
      status === 'turn' && place?.seq != null
        ? {
            seq: formatCount(place.seq, locale),
            seconds: turnSeconds,
            claiming: visible && (!claim || claim.kind === 'retry' || claimQuery.isFetching === true),
            signInHref: claim?.kind === 'sign-in' ? signInHref : null,
          }
        : null,
    claimNow: () => {
      void claimQuery.refetch();
    },
    queueAgain: () => {
      analyticsAdapter.trackEvent('queue_rejoin', { eventId });
      rejoinNext.current = true;
      void joinQuery.refetch();
    },
    errorMessage,
    retry: () => {
      void joinQuery.refetch();
    },
    locale,
    setLocale: (next) => {
      storage.set(STORAGE_KEYS.LANGUAGE, next);
      void i18n.changeLanguage(next);
    },
    nav: mainNav(t, 'queue'),
    homeHref: ROUTES.HOME,
  };
};

export default QueueController;
