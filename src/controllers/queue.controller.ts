import { useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';

import type { HttpError } from '@core/protocols/http.protocol';
import type { HomeEvents } from '@core/use_case/catalog/get-home-events.use-case';
import type { JoinQueueResult } from '@core/use_case/queue/join-queue.use-case';
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

export interface QueueControllerInterface {
  t: TFunction;
  status: QueueStatus;
  event: QueueEventView | null;
  waiting: QueueWaitingView | null;
  prequeue: QueuePrequeueView | null;
  paused: QueuePausedView | null;
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
  | 'getHomeEventsUseCase'
  | 'analyticsAdapter'
  | 'storage'
  | 'ERROR_CODE_MAP'
  | 'useTranslation'
  | 'useQueryTanstack'
  | 'useSearchParamsNext'
>;

/** Same query as Home, so arriving from Home shows the poster at once. */
const EVENTS_STALE_MS = 5_000;

const QueueController = ({
  joinQueueUseCase,
  getHomeEventsUseCase,
  analyticsAdapter,
  storage,
  ERROR_CODE_MAP,
  useTranslation,
  useQueryTanstack,
  useSearchParamsNext,
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

  // One join per visit: every join costs a Turnstile check, and joining again returns the same place anyway.
  const joinQuery = useQueryTanstack<JoinQueueResult, HttpError>({
    queryKey: [QUERY_KEYS.QUEUE_PLACE, eventId],
    queryFn: () => joinQueueUseCase.execute(eventId),
    enabled: hasEventId,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const result = joinQuery.data;
  const status = queueStatusFor(hasEventId, result, joinQuery.isError);
  const place = result?.kind === 'joined' ? result.place : null;
  const summary = findHomeEvent(eventsQuery.data, eventId);

  const trackedFor = useRef<JoinQueueResult | null>(null);
  useEffect(() => {
    if (!result || trackedFor.current === result) return;
    trackedFor.current = result;
    analyticsAdapter.trackEvent('queue_join', {
      eventId,
      outcome: result.kind,
      state: result.kind === 'joined' ? result.place.state : 'none',
    });
  }, [result, analyticsAdapter, eventId]);

  // Pre-queue countdown: server times plus the time since the answer arrived, never the device clock alone.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status !== 'prequeue') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);
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

  const waiting = useMemo((): QueueWaitingView | null => {
    if (status !== 'waiting' || !place || place.seq === null || place.served === null) return null;
    return {
      position: formatCount(place.position ?? 1, locale),
      progress: place.progress,
      served: formatCount(place.served, locale),
      seq: formatCount(place.seq, locale),
    };
  }, [status, place, locale]);

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
              summary?.state === 'temporarily_full' ? t('home_temporarily_full_note') : t('queue_paused_operator'),
          }
        : null,
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
