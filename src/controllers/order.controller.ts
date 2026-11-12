import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod/mini';
import type { TFunction } from 'i18next';

import type { User } from '@core/entities/auth/auth.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { OrderCategoriesResult } from '@core/use_case/booking/get-order-categories.use-case';
import type { HolderType, TicketQuantities } from '@core/use_case/booking/order-ticket-selection.use-case';
import type { ValidateAttendeeResult } from '@core/use_case/booking/validate-attendee.use-case';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import type { FormatLocale } from '@utils/format/date';
import { maskNik, toNikDigits } from '@utils/format/nik';
import {
  toOrderCategoryView,
  toOrderEventView,
  type OrderCategoryView,
  type OrderEventView,
} from '@utils/format/order-event';
import { retryTransientOnce } from '@utils/query/retry';
import { QUERY_KEYS } from '@utils/constants/query-keys';
import { ROUTES, withQuery } from '@utils/constants/routes';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';

export type OrderStatus = 'loading' | 'error' | 'not-found' | 'ready';

export interface FlowStep {
  number: 1 | 2 | 3;
  label: string;
  current: boolean;
}

/** Re-exported so the presentation layer never imports from @core. */
export type OrderHolderType = HolderType;

/** A category row: the spec 44 view plus its stepper. */
export interface OrderCategoryRow extends OrderCategoryView {
  quantity: number;
  /** quantity > 0: accent name and filled count. */
  selected: boolean;
  canIncrement: boolean;
  canDecrement: boolean;
  /** "Tambah Festival B" / "Add Festival B". */
  incrementLabel: string;
  /** "Kurangi Festival B" / "Remove Festival B". */
  decrementLabel: string;
}

export interface OrderHolderNameField {
  id: string;
  value: string;
  /** True for "Saya sendiri" (name from the profile). */
  readOnly: boolean;
  /** "Dari profil Anda." when read-only, else "Dicetak di e-tiket.". */
  hint: string;
  onChange: (value: string) => void;
  /** Starts the Dukcapil check when the NIK is already locally ok. */
  onBlur: () => void;
}

export interface OrderHolderNikField {
  id: string;
  /** Raw digits while focused; masked ("3174 •••• •••• 0004") otherwise. */
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  /** Marks the field touched and starts the Dukcapil check when locally ok with a name. */
  onBlur: () => void;
  /** Translated field error (local or Dukcapil); undefined when none. */
  error?: string;
  /** "Nama dan NIK cocok dengan Dukcapil." after a valid check; undefined otherwise. */
  valid?: string;
  /** A check for the current values is in flight. */
  checking: boolean;
  /** The last check failed in a retryable way (busy, rate limited, unknown): show "Periksa lagi". */
  canRecheck: boolean;
  /** Runs the check again with the current values; no-op unless canRecheck. */
  recheck: () => void;
}

export interface OrderHolderView {
  /** Slot key: React key and id base. */
  key: string;
  /** "Tiket 1 · Festival B" / "Ticket 1 · Festival B". */
  title: string;
  holderType: OrderHolderType;
  /** Radio group name: `order-holder-${key}-type`. */
  choiceName: string;
  /** "Saya sendiri" is taken by another ticket (block, spec 47). */
  selfDisabled: boolean;
  choose: (holderType: OrderHolderType) => void;
  name: OrderHolderNameField;
  nik: OrderHolderNikField;
}

/** The line under the category list when the order limit is reached (HiFi `.limit`). */
export interface OrderLimitNotice {
  /** "3/3": tickets picked / order limit. */
  count: string;
  /** "Batas 3 tiket tercapai. Kurangi satu untuk ganti kategori." or the reservation variant. */
  message: string;
}

/** The order-window countdown for the flow header (FR-17-W1): what the shared Timer component takes. */
export interface OrderTimerView {
  /** Whole seconds left, rounded down, never negative. From server time plus elapsed client time. */
  seconds: number;
  /** "sisa waktu memilih" / "left to choose". */
  label: string;
}

export interface OrderControllerInterface {
  t: TFunction;
  status: OrderStatus;
  /** Null until the event loads, and in the not-found state. */
  event: OrderEventView | null;
  /** Server order; empty until the categories load. */
  categories: OrderCategoryRow[];
  increment: (categoryId: string) => void;
  decrement: (categoryId: string) => void;
  totalTickets: number;
  /** min(3, maxTicketsPerOrder, reservedUnits); 0 until loaded. */
  orderLimit: number;
  /** status === 'ready' && totalTickets >= 1. */
  showHolders: boolean;
  /** The profile has a name: show "Saya sendiri" / "Orang lain". */
  showHolderChoice: boolean;
  /** One per ticket, slot order; empty when totalTickets is 0. */
  holders: OrderHolderView[];
  /** Non-null only when status is 'ready' and the order limit is reached. */
  limitNotice: OrderLimitNotice | null;
  /** "Maks. {{count}} tiket per transaksi. …" with count = orderLimit; '' until loaded. */
  categoryNote: string;
  /** Translated; '' unless status is 'error'. */
  errorMessage: string;
  /** Refetches every failed query. */
  retry: () => void;
  steps: FlowStep[];
  /** /queue?event=<id>, or Home without an event id. */
  backHref: string;
  homeHref: string;
  locale: FormatLocale;
  setLocale: (locale: FormatLocale) => void;
  /** Every ticket holder passed the Dukcapil check (≥ 1 holder). For the payment button (FR-16+). */
  allHoldersVerified: boolean;
  /** Null unless status is 'ready' and the answer's expiresAt / serverNow are valid dates. */
  timer: OrderTimerView | null;
  /** The order window has run out (seconds left is 0). Exposed for FR-18-W1; nothing reacts to it yet. */
  timeUp: boolean;
}

type OrderControllerDeps = Pick<
  AwilixRegistry,
  | 'catalogService'
  | 'accountService'
  | 'getOrderCategoriesUseCase'
  | 'orderTicketSelectionUseCase'
  | 'validateAttendeeUseCase'
  | 'admissionStore'
  | 'analyticsAdapter'
  | 'storage'
  | 'ERROR_CODE_MAP'
  | 'useTranslation'
  | 'useQueryTanstack'
  | 'useMutationTanstack'
  | 'useRouterNext'
  | 'useSearchParamsNext'
>;

/** The event header barely changes during a sale. */
const EVENT_STALE_MS = 60_000;

const holdersSchema = z.object({
  holders: z.array(
    z.object({
      slotKey: z.string(),
      holderType: z.enum(['self', 'other']),
      fullName: z
        .string()
        .check(z.trim(), z.minLength(1, 'login_name_required'), z.maxLength(200, 'login_name_too_long')),
      /** Digits only (toNikDigits on change); every NIK rule is in validateAttendeeUseCase (FR-15-W1). */
      nik: z.string(),
    }),
  ),
});
type HoldersValues = z.infer<typeof holdersSchema>;

/** What the mutation sends for one slot. fullName is the raw form value (the use case trims it). */
interface NikCheckVariables {
  slotKey: string;
  fieldIndex: number;
  fullName: string;
  nik: string;
}

/** The check run of one slot, for exactly these values. */
type NikCheckRun =
  | { nik: string; fullName: string; phase: 'checking' }
  | { nik: string; fullName: string; phase: 'done'; result: ValidateAttendeeResult }
  | { nik: string; fullName: string; phase: 'failed'; code: string };

type NikCheckState = 'idle' | 'checking' | 'valid' | 'error';

/** The answer the countdown runs from: its server times and when it arrived (the query's dataUpdatedAt). */
interface TimerAnchor {
  expiresAt: string;
  serverNow: string;
  receivedAt: number;
}

/** Stable empty list for summarize before the categories load (constant, not mutable state). */
const NO_CATEGORIES: readonly [] = [];
/** No-op handler for a holder view whose form entry is missing (not expected after reconcileHolders). */
const IGNORE = () => {};

const OrderController = ({
  catalogService,
  accountService,
  getOrderCategoriesUseCase,
  orderTicketSelectionUseCase,
  validateAttendeeUseCase,
  admissionStore,
  analyticsAdapter,
  storage,
  ERROR_CODE_MAP,
  useTranslation,
  useQueryTanstack,
  useMutationTanstack,
  useRouterNext,
  useSearchParamsNext,
}: OrderControllerDeps): OrderControllerInterface => {
  const { t, i18n } = useTranslation();
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'id';
  const router = useRouterNext();
  const searchParams = useSearchParamsNext();
  const eventId = searchParams.get('event')?.trim() ?? '';
  const hasEventId = eventId !== '';

  useEffect(() => {
    analyticsAdapter.trackPageView('order');
  }, [analyticsAdapter]);

  const eventQuery = useQueryTanstack<EventSummary, HttpError>({
    queryKey: [QUERY_KEYS.EVENT, eventId],
    queryFn: async () => (await catalogService.getEvent(eventId)).data,
    enabled: hasEventId,
    staleTime: EVENT_STALE_MS,
    retry: retryTransientOnce,
  });

  // The token is read at fetch time and never put in the key; gcTime 0: the snapshot belongs to one admission.
  const categoriesQuery = useQueryTanstack<OrderCategoriesResult, HttpError>({
    queryKey: [QUERY_KEYS.CATEGORIES, eventId, locale],
    queryFn: () => getOrderCategoriesUseCase.execute({ eventId, admissionToken: admissionStore.get(eventId) }),
    enabled: hasEventId,
    gcTime: 0,
    retry: retryTransientOnce,
    placeholderData: (previous) => previous,
  });

  const eventData = eventQuery.data;
  const categoriesData = categoriesQuery.data;
  const eventError = eventQuery.isError ? eventQuery.error : null;
  const categoriesError = categoriesQuery.isError ? categoriesQuery.error : null;

  const eventNotFound = !!eventError && (eventError.code === 'NOT_FOUND' || eventError.status === 404);
  const shouldRedirect = !!eventData && categoriesData?.kind === 'admission-invalid';

  const redirected = useRef(false);
  useEffect(() => {
    if (!shouldRedirect || redirected.current) return;
    redirected.current = true;
    router.replace(withQuery(ROUTES.QUEUE, { event: eventId }));
  }, [shouldRedirect, router, eventId]);

  const ok = categoriesData?.kind === 'ok' ? categoriesData : null;

  // The countdown's anchor is written only from a real answer: on a language switch TanStack shows the previous
  // answer as placeholder data with the new query's dataUpdatedAt of 0, which must not move the countdown (FR-17-W1).
  const [anchor, setAnchor] = useState<TimerAnchor | null>(null);
  if (ok && !categoriesQuery.isPlaceholderData && categoriesQuery.dataUpdatedAt !== anchor?.receivedAt) {
    setAnchor({ expiresAt: ok.expiresAt, serverNow: ok.serverNow, receivedAt: categoriesQuery.dataUpdatedAt });
  }

  let status: OrderStatus = 'loading';
  if (!hasEventId || eventNotFound) status = 'not-found';
  else if (eventError || categoriesError) status = 'error';
  else if (eventData && ok) status = 'ready';

  const event = useMemo(
    () => (eventData && !eventNotFound ? toOrderEventView(eventData, locale) : null),
    [eventData, eventNotFound, locale],
  );

  // The profile only prefills "Saya sendiri": any failure (401 included) hides the choice, silently.
  const meQuery = useQueryTanstack<User, HttpError>({
    queryKey: [QUERY_KEYS.ME],
    queryFn: async () => (await accountService.getMe()).data,
    enabled: status === 'ready',
    retry: false,
    refetchOnWindowFocus: false,
  });
  const profileName = (!meQuery.isError && meQuery.data?.fullName?.trim()) || '';
  const showHolderChoice = profileName !== '';

  const [quantities, setQuantities] = useState<TicketQuantities>({});
  const [focusedNik, setFocusedNik] = useState<string | null>(null);
  const selectable = ok?.categories ?? NO_CATEGORIES;
  const limit = ok ? orderTicketSelectionUseCase.orderLimit(ok) : 0;
  const selection = useMemo(
    () => orderTicketSelectionUseCase.summarize(selectable, quantities, limit),
    [orderTicketSelectionUseCase, selectable, quantities, limit],
  );

  const formApi = useForm<HoldersValues>({ resolver: zodResolver(holdersSchema), defaultValues: { holders: [] } });
  const holderValues = useWatch({ control: formApi.control, name: 'holders' });

  const categories = useMemo<OrderCategoryRow[]>(
    () =>
      ok
        ? ok.categories.map((category, i) => {
            const line = selection.lines[i];
            const view = toOrderCategoryView(category, locale, t);
            return {
              ...view,
              quantity: line.quantity,
              selected: line.quantity > 0,
              canIncrement: line.canIncrement,
              canDecrement: line.canDecrement,
              incrementLabel: t('order_stepper_increase', { category: view.name }),
              decrementLabel: t('order_stepper_decrease', { category: view.name }),
            };
          })
        : [],
    [ok, locale, t, selection],
  );

  // The check run per slot key, tied to the exact values sent; touchedNik: NIK fields blurred at least once.
  const [checks, setChecks] = useState<Record<string, NikCheckRun>>({});
  const [touchedNik, setTouchedNik] = useState<Record<string, true>>({});

  // One mutation for every slot: the callbacks get the variables, so each result lands on its own slot.
  // No loading overlay: a field check leaves the page usable (spec 55). The retry is in the use case.
  const { mutate: mutateNikCheck } = useMutationTanstack<ValidateAttendeeResult, HttpError, NikCheckVariables>({
    mutationFn: ({ fieldIndex, fullName, nik }) =>
      validateAttendeeUseCase.execute({
        eventId,
        admissionToken: admissionStore.get(eventId),
        fieldIndex,
        fullName,
        nik,
      }),
    retry: false,
    onMutate: ({ slotKey, nik, fullName }) => {
      setChecks((prev) => ({ ...prev, [slotKey]: { nik, fullName, phase: 'checking' } }));
    },
    onSuccess: (result, { slotKey, nik, fullName }) => {
      if (result.kind === 'admission-invalid') {
        if (redirected.current) return;
        redirected.current = true;
        router.replace(withQuery(ROUTES.QUEUE, { event: eventId }));
        return;
      }
      analyticsAdapter.trackEvent('order_nik_checked', { outcome: result.kind });
      setChecks((prev) => {
        const run = prev[slotKey];
        if (run?.phase !== 'checking' || run.nik !== nik || run.fullName !== fullName) return prev;
        return { ...prev, [slotKey]: { nik, fullName, phase: 'done', result } };
      });
    },
    // No popup, analytics or reportError: the error's cause may hold the request body with the NIK.
    onError: (error, { slotKey, nik, fullName }) => {
      setChecks((prev) => {
        const run = prev[slotKey];
        if (run?.phase !== 'checking' || run.nik !== nik || run.fullName !== fullName) return prev;
        return { ...prev, [slotKey]: { nik, fullName, phase: 'failed', code: error.code } };
      });
    },
  });

  /** Starts a check for the slot's current values unless they are not locally ok or `run` already covers them. */
  const startCheck = useCallback(
    (slotKey: string, force: boolean, run: NikCheckRun | undefined) => {
      const values = formApi.getValues('holders');
      const position = selection.slots.findIndex((slot) => slot.key === slotKey);
      const entry = values.find((holder) => holder.slotKey === slotKey);
      if (position < 0 || !entry) return;
      const earlier = selection.slots
        .slice(0, position)
        .map((slot) => values.find((holder) => holder.slotKey === slot.key)?.nik ?? '');
      if (validateAttendeeUseCase.checkNik(entry.nik, earlier).kind !== 'ok' || entry.fullName.trim() === '') return;
      const same = run !== undefined && run.nik === entry.nik && run.fullName === entry.fullName;
      if (same && (run.phase === 'checking' || !force)) return;
      mutateNikCheck({
        slotKey,
        fieldIndex: selection.slots[position].index - 1,
        fullName: entry.fullName,
        nik: entry.nik,
      });
    },
    [formApi, selection.slots, validateAttendeeUseCase, mutateNikCheck],
  );

  /** Drops the slot's run (and its validation token); same object when there is none. */
  const dropRun = useCallback((slotKey: string) => {
    setChecks((prev) => {
      if (!(slotKey in prev)) return prev;
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });
  }, []);

  const applyQuantities = (next: TicketQuantities) => {
    setQuantities(next);
    const nextSlots = orderTicketSelectionUseCase.summarize(selectable, next, limit).slots;
    formApi.setValue('holders', orderTicketSelectionUseCase.reconcileHolders(formApi.getValues('holders'), nextSlots));
    const kept = new Set(nextSlots.map((slot) => slot.key));
    setChecks((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => kept.has(key))));
    setTouchedNik((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => kept.has(key))));
  };

  const { holders, allHoldersVerified } = useMemo(() => {
    const states: NikCheckState[] = [];
    const views = selection.slots.map((slot, position): OrderHolderView => {
      const index = holderValues.findIndex((holder) => holder.slotKey === slot.key);
      const entry = index >= 0 ? holderValues[index] : null;
      const holderType: OrderHolderType = entry?.holderType ?? 'other';
      const readOnly = holderType === 'self' && showHolderChoice;
      const digits = entry?.nik ?? '';
      const fullName = entry?.fullName ?? '';
      const earlier = selection.slots
        .slice(0, position)
        .map((other) => holderValues.find((holder) => holder.slotKey === other.key)?.nik ?? '');
      const local = validateAttendeeUseCase.checkNik(digits, earlier);
      const showFormatError = touchedNik[slot.key] === true && focusedNik !== slot.key;
      const stored = checks[slot.key];
      const run = stored && stored.nik === digits && stored.fullName === fullName ? stored : undefined;

      // First match wins (spec 55 field-state table).
      let state: NikCheckState = 'idle';
      let error: string | undefined;
      let valid: string | undefined;
      let canRecheck = false;
      if (local.kind === 'duplicate') {
        state = 'error';
        error = t('order_nik_duplicate', { index: local.ticketIndex });
      } else if (local.kind === 'incomplete' || local.kind === 'invalid-structure') {
        if (showFormatError) {
          state = 'error';
          error = t(local.kind === 'incomplete' ? 'order_nik_incomplete' : 'order_nik_invalid_structure');
        }
      } else if (local.kind === 'ok' && run) {
        if (run.phase === 'checking') {
          state = 'checking';
        } else if (run.phase === 'failed') {
          state = 'error';
          error = t(ERROR_CODE_MAP[run.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR);
          canRecheck = true;
        } else {
          const { result } = run;
          state = result.kind === 'valid' ? 'valid' : 'error';
          switch (result.kind) {
            case 'valid':
              valid = t('order_nik_valid');
              break;
            case 'nik-invalid':
              error = t('error_nik_invalid');
              break;
            case 'seat-taken':
              error = `${t('error_nik_seat_taken')} ${t('order_nik_use_another')}`;
              break;
            case 'duplicate':
              error = t('error_duplicate_nik');
              break;
            case 'rate-limited':
              error =
                result.retryAfterSeconds === null
                  ? t('order_nik_rate_limited_later')
                  : t('order_nik_rate_limited', { count: result.retryAfterSeconds });
              canRecheck = true;
              break;
            case 'unavailable':
              error = t('order_nik_unavailable');
              canRecheck = true;
              break;
            case 'admission-invalid':
              // Never stored: onSuccess redirects.
              state = 'idle';
              break;
          }
        }
      }
      states.push(state);

      return {
        key: slot.key,
        title: t('order_holder_title', { index: slot.index, category: slot.categoryName }),
        holderType,
        choiceName: `order-holder-${slot.key}-type`,
        selfDisabled: !orderTicketSelectionUseCase.canChooseSelf(holderValues, slot.key),
        choose: entry
          ? (next) => {
              const result = orderTicketSelectionUseCase.setHolderType(
                formApi.getValues('holders'),
                slot.key,
                next,
                profileName,
              );
              if (result.kind !== 'changed') return;
              formApi.setValue('holders', result.holders);
              dropRun(slot.key);
              // The run was just dropped, so nothing covers the new values.
              if (next === 'self') startCheck(slot.key, false, undefined);
            }
          : IGNORE,
        name: {
          id: `order-holder-${slot.key}-name`,
          value: fullName,
          readOnly,
          hint: t(readOnly ? 'order_holder_name_hint_profile' : 'order_holder_name_hint'),
          onChange:
            entry && !readOnly
              ? (value) => {
                  if (formApi.getValues(`holders.${index}.fullName`) === value) return;
                  formApi.setValue(`holders.${index}.fullName`, value);
                  dropRun(slot.key);
                }
              : IGNORE,
          onBlur: () => startCheck(slot.key, false, stored),
        },
        nik: {
          id: `order-holder-${slot.key}-nik`,
          value: focusedNik === slot.key ? digits : maskNik(digits),
          onChange: entry
            ? (value) => {
                const nextDigits = toNikDigits(value);
                if (formApi.getValues(`holders.${index}.nik`) === nextDigits) return;
                formApi.setValue(`holders.${index}.nik`, nextDigits);
                dropRun(slot.key);
              }
            : IGNORE,
          onFocus: () => setFocusedNik(slot.key),
          onBlur: () => {
            setFocusedNik((current) => (current === slot.key ? null : current));
            setTouchedNik((prev) => (prev[slot.key] ? prev : { ...prev, [slot.key]: true }));
            startCheck(slot.key, false, stored);
          },
          error,
          valid,
          checking: state === 'checking',
          canRecheck,
          recheck: canRecheck ? () => startCheck(slot.key, true, stored) : IGNORE,
        },
      };
    });
    return {
      holders: views,
      allHoldersVerified: states.length > 0 && states.every((state) => state === 'valid'),
    };
  }, [
    orderTicketSelectionUseCase,
    validateAttendeeUseCase,
    formApi,
    selection.slots,
    holderValues,
    focusedNik,
    touchedNik,
    checks,
    profileName,
    showHolderChoice,
    startCheck,
    dropRun,
    ERROR_CODE_MAP,
    t,
  ]);

  const limitNotice = useMemo<OrderLimitNotice | null>(
    () =>
      status === 'ready' && selection.limitReached
        ? {
            count: `${selection.total}/${limit}`,
            message: t(selection.limitBelowMax ? 'order_limit_reached_reserved' : 'order_limit_reached', {
              count: limit,
            }),
          }
        : null,
    [status, selection, limit, t],
  );

  // The 5-minute order window: server times give its length, the device clock only measures the time since the
  // answer arrived (elapsed time, never a deadline against the device clock).
  const [now, setNow] = useState(() => Date.now());
  const windowSeconds = anchor ? (Date.parse(anchor.expiresAt) - Date.parse(anchor.serverNow)) / 1000 : NaN;
  const secondsLeft =
    ok && anchor && Number.isFinite(windowSeconds)
      ? Math.max(0, windowSeconds - Math.max(0, now - anchor.receivedAt) / 1000)
      : null;
  const ticking = secondsLeft !== null && secondsLeft > 0;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  const errorCode = (eventError ?? categoriesError)?.code;
  const errorMessage =
    status === 'error' && errorCode ? t(ERROR_CODE_MAP[errorCode] ?? ERROR_CODE_MAP.UNKNOWN_ERROR) : '';

  const steps: FlowStep[] = [
    { number: 1, label: t('order_step_choose'), current: true },
    { number: 2, label: t('order_step_pay'), current: false },
    { number: 3, label: t('order_step_ticket'), current: false },
  ];

  return {
    t,
    status,
    event,
    categories,
    increment: (categoryId) => {
      const result = orderTicketSelectionUseCase.increment(selectable, quantities, categoryId, limit);
      if (result.kind === 'changed') applyQuantities(result.quantities);
    },
    decrement: (categoryId) => {
      const result = orderTicketSelectionUseCase.decrement(selectable, quantities, categoryId);
      if (result.kind === 'changed') applyQuantities(result.quantities);
    },
    totalTickets: selection.total,
    orderLimit: limit,
    showHolders: status === 'ready' && selection.total >= 1,
    showHolderChoice,
    holders,
    limitNotice,
    categoryNote: ok ? t('order_category_note', { count: limit }) : '',
    errorMessage,
    retry: () => {
      if (eventQuery.isError) void eventQuery.refetch();
      if (categoriesQuery.isError) void categoriesQuery.refetch();
    },
    steps,
    backHref: hasEventId ? withQuery(ROUTES.QUEUE, { event: eventId }) : ROUTES.HOME,
    homeHref: ROUTES.HOME,
    locale,
    setLocale: (next) => {
      storage.set(STORAGE_KEYS.LANGUAGE, next);
      void i18n.changeLanguage(next);
    },
    allHoldersVerified,
    timer:
      status === 'ready' && secondsLeft !== null
        ? { seconds: Math.floor(secondsLeft), label: t('order_timer_label') }
        : null,
    timeUp: status === 'ready' && secondsLeft === 0,
  };
};

export default OrderController;
