import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod/mini';
import type { TFunction } from 'i18next';

import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { OrderCategoriesResult } from '@core/use_case/booking/get-order-categories.use-case';
import type { HoldBookingInput, HoldBookingResult, HoldTicket } from '@core/use_case/booking/hold-booking.use-case';
import type { TicketQuantities } from '@core/use_case/booking/order-ticket-selection.use-case';
import type { ValidateAttendeeResult } from '@core/use_case/booking/validate-attendee.use-case';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import { ANALYTICS_CURRENCY, ANALYTICS_EVENTS, categoryItem } from '@utils/analytics';
import type { FormatLocale } from '@utils/format/date';
import { maskNik, toNikDigits } from '@utils/format/nik';
import { formatRupiah } from '@utils/format/number';
import {
  toOrderCategoryView,
  toOrderEventView,
  type OrderCategoryView,
  type OrderEventView,
} from '@utils/format/order-event';
import { retryTransientOnce } from '@utils/query/retry';
import { MUTATION_KEYS, QUERY_KEYS } from '@utils/constants/query-keys';
import { ROUTES, withQuery } from '@utils/constants/routes';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';
import { randomUuid } from '@utils/random-uuid';

export type OrderStatus = 'loading' | 'error' | 'not-found' | 'ready';

export interface FlowStep {
  number: 1 | 2 | 3;
  label: string;
  current: boolean;
}

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
  /** "Dicetak di e-tiket.". */
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

/** The time's-up sheet (FR-18-W1): what OrderTimeUpSheet shows. Texts are translated. */
export interface OrderTimeUpView {
  /** "Waktu habis" / "Time's up". */
  stamp: string;
  /** "5 menit sudah lewat." / "Your 5 minutes are up." */
  title: string;
  /** "Pilihan Anda belum disimpan dan tempat Anda kami berikan ke nomor berikutnya. Antre lagi untuk mencoba lagi." */
  body: string;
  /** "Antre lagi" / "Queue again" (the arrow is drawn by the sheet, aria-hidden). */
  queueAgainLabel: string;
  /** "Ke beranda" / "Go home". */
  homeLabel: string;
  /** ROUTES.HOME. */
  homeHref: string;
  /** Tracks queue_rejoin and replaces the page with /queue?event=<id>: the waiting room joins at the back. */
  queueAgain: () => void;
}

/** One summary row: "2 × Festival B" and its line total. */
export interface OrderSummaryLine {
  /** categoryId: React key. */
  key: string;
  /** "2 × Festival B". */
  label: string;
  /** "Rp 1.700.000" (ID) / "Rp 1,700,000" (EN). */
  amount: string;
}

/** The "Ringkasan" aside and the phone dock (FR-16-W1). Texts translated, money formatted. */
export interface OrderSummaryView {
  /** "Ringkasan" / "Summary". */
  heading: string;
  lines: OrderSummaryLine[];
  /** "Biaya layanan" / "Service fee". */
  feeLabel: string;
  /** The admin fee, once per order (ADR-0010). */
  fee: string;
  /** "Total". */
  totalLabel: string;
  total: string;
  /** "Tiket ditahan untuk Anda selama 10 menit saat Anda lanjut. Belum ada biaya sampai Anda membayar." */
  note: string;
  /** Dock: "3 tiket" / "3 tickets". */
  ticketCount: string;
  /** Dock region label: "Ringkasan pesanan" / "Order summary". */
  dockLabel: string;
}

export interface OrderCheckoutHint {
  text: string;
  /** True for a hold refusal (red, role="alert"); false for the neutral "complete the holders" hint. */
  error: boolean;
}

/** "Lanjut ke pembayaran" (FR-16-W1). */
export interface OrderCheckoutView {
  /** "Lanjut ke pembayaran" / "Continue to payment" (the arrow is drawn by the section, aria-hidden). */
  label: string;
  /** Dock: "Lanjut bayar" / "Continue". */
  shortLabel: string;
  enabled: boolean;
  /** A hold is in flight, or it succeeded and the page is navigating. */
  busy: boolean;
  /** Why the button is disabled; null when enabled or busy. */
  hint: OrderCheckoutHint | null;
  /** No-op unless enabled; a second tap while one is in flight is ignored. */
  onContinue: () => void;
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
  /**
   * The order window has run out on this page visit: true from the first render at zero, or from a reload whose
   * re-claim found the window ended (FR-19-W1); then latched (stays true whatever status does later). Drives timeUpSheet.
   */
  timeUp: boolean;
  /** Non-null exactly when timeUp. */
  timeUpSheet: OrderTimeUpView | null;
  /** Non-null exactly when status is 'ready', totalTickets ≥ 1 and not timeUp (FR-16-W1). */
  summary: OrderSummaryView | null;
  /** Non-null exactly when summary is. */
  checkout: OrderCheckoutView | null;
}

/** How long the ticket count must stay still before add_to_cart is sent. */
const ADD_TO_CART_SETTLE_MS = 1000;

/** NIK check answers that are `nik_rejected` reasons (tracking plan §3); the others are not rejections. */
const NIK_REJECTIONS: Partial<Record<ValidateAttendeeResult['kind'], string>> = {
  'nik-invalid': 'NIK_INVALID',
  'seat-taken': 'NIK_SEAT_TAKEN',
  duplicate: 'DUPLICATE_NIK',
  unavailable: 'DUKCAPIL_UNAVAILABLE',
};

type OrderControllerDeps = Pick<
  AwilixRegistry,
  | 'catalogService'
  | 'getOrderCategoriesUseCase'
  | 'orderTicketSelectionUseCase'
  | 'validateAttendeeUseCase'
  | 'endOrderWindowUseCase'
  | 'holdBookingUseCase'
  | 'admissionStore'
  | 'analyticsAdapter'
  | 'storage'
  | 'ERROR_CODE_MAP'
  | 'useTranslation'
  | 'useQueryTanstack'
  | 'useMutationTanstack'
  | 'useRouterNext'
  | 'useSearchParamsNext'
  | 'useLoading'
  | 'usePopupError'
>;

/** The event header barely changes during a sale. */
const EVENT_STALE_MS = 60_000;

const holdersSchema = z.object({
  holders: z.array(
    z.object({
      slotKey: z.string(),
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

/** The selection one Idempotency-Key belongs to, and the booking it already created. */
interface HoldAttempt {
  /** `${categoryId}:${validationToken}` per ticket, slot order, joined by '|'. */
  signature: string;
  idempotencyKey: string;
  bookingId: string | null;
}

/** A hold refusal the page keeps showing until the selection changes. */
type HoldFlag =
  | { kind: 'sold-out'; categoryId: string | null }
  | { kind: 'over-reservation' }
  | { kind: 'holders'; code: 'NIK_SEAT_TAKEN' | 'DUPLICATE_NIK' | 'ATTENDEE_NOT_VALIDATED' };

/** Stable empty list for summarize before the categories load (constant, not mutable state). */
const NO_CATEGORIES: readonly [] = [];
/** No-op handler for a holder view whose form entry is missing (not expected after reconcileHolders). */
const IGNORE = () => {};

const OrderController = ({
  catalogService,
  getOrderCategoriesUseCase,
  orderTicketSelectionUseCase,
  validateAttendeeUseCase,
  endOrderWindowUseCase,
  holdBookingUseCase,
  admissionStore,
  analyticsAdapter,
  storage,
  ERROR_CODE_MAP,
  useTranslation,
  useQueryTanstack,
  useMutationTanstack,
  useRouterNext,
  useSearchParamsNext,
  useLoading,
  usePopupError,
}: OrderControllerDeps): OrderControllerInterface => {
  const { t, i18n } = useTranslation();
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'id';
  const router = useRouterNext();
  const { toggleLoading } = useLoading();
  const { openPopupError } = usePopupError();
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

  // Latched the first render the order window is at zero (FR-18-W1); never reset while mounted.
  const [expired, setExpired] = useState(false);

  // The token is read at fetch time and never put in the key; gcTime 0: the snapshot belongs to one admission.
  const categoriesQuery = useQueryTanstack<OrderCategoriesResult, HttpError>({
    queryKey: [QUERY_KEYS.CATEGORIES, eventId, locale],
    queryFn: () => getOrderCategoriesUseCase.execute({ eventId, admissionToken: admissionStore.get(eventId) }),
    // Off after expiry: a language switch then keeps the placeholder instead of fetching with a cleared token.
    enabled: hasEventId && !expired,
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

  // FR-19-W1: a reload claimed the turn again (spec 64); once per page visit (a placeholder or refetch never repeats it).
  const resumedTracked = useRef(false);
  useEffect(() => {
    if (!ok?.resumed || resumedTracked.current) return;
    resumedTracked.current = true;
    analyticsAdapter.trackEvent('order_resumed', { eventId });
  }, [ok, analyticsAdapter, eventId]);

  let status: OrderStatus = 'loading';
  if (!hasEventId || eventNotFound) status = 'not-found';
  else if (eventError || categoriesError) status = 'error';
  else if (eventData && ok) status = 'ready';

  const event = useMemo(
    () => (eventData && !eventNotFound ? toOrderEventView(eventData, locale) : null),
    [eventData, eventNotFound, locale],
  );

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

  // FR-16-W1. leaving: the hold succeeded (or the buyer opened the active booking) and the page is navigating away.
  const [leaving, setLeaving] = useState(false);
  // A hold refusal shown in the checkout hint until the quantities change (or the next tap).
  const [holdFlag, setHoldFlag] = useState<HoldFlag | null>(null);
  // Written only in handlers and mutation callbacks: the Idempotency-Key per selection, and the double-tap guard.
  const attemptRef = useRef<HoldAttempt | null>(null);
  const holdGuard = useRef(false);
  // The latest checkout handler, for the retry popup's "Coba lagi" (set in an effect below).
  const continueRef = useRef<() => void>(IGNORE);

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
      // Tracking plan §3: a rejected NIK, by reason only (never the NIK).
      const rejected = NIK_REJECTIONS[result.kind];
      if (rejected) analyticsAdapter.trackEvent(ANALYTICS_EVENTS.NIK_REJECTED, { event_id: eventId, reason: rejected });
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
    setHoldFlag(null);
  };

  const { holders, allHoldersVerified } = useMemo(() => {
    const states: NikCheckState[] = [];
    const views = selection.slots.map((slot, position): OrderHolderView => {
      const index = holderValues.findIndex((holder) => holder.slotKey === slot.key);
      const entry = index >= 0 ? holderValues[index] : null;
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
        name: {
          id: `order-holder-${slot.key}-name`,
          value: fullName,
          hint: t('order_holder_name_hint'),
          onChange: entry
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
    validateAttendeeUseCase,
    formApi,
    selection.slots,
    holderValues,
    focusedNik,
    touchedNik,
    checks,
    startCheck,
    dropRun,
    ERROR_CODE_MAP,
    t,
  ]);

  // Tracking plan §2 steps 7–9 and §3 for this page.
  const analyticsEvent = useMemo(() => (eventData ? { eventId, name: eventData.name } : null), [eventData, eventId]);
  const viewTracked = useRef(false);
  useEffect(() => {
    if (!ok || !analyticsEvent || viewTracked.current) return;
    viewTracked.current = true;
    const prices = ok.categories.map((category) => category.price.amount);
    analyticsAdapter.trackEvent(ANALYTICS_EVENTS.VIEW_ITEM, {
      event_id: eventId,
      currency: ANALYTICS_CURRENCY,
      value: prices.length > 0 ? Math.min(...prices) : 0,
      items: ok.categories.map((category) => categoryItem(category, analyticsEvent)),
    });
    if (ok.categories.length > 0 && ok.categories.every((category) => category.availability === 'sold_out')) {
      analyticsAdapter.trackEvent(ANALYTICS_EVENTS.SOLD_OUT_SEEN, { event_id: eventId, where: 'order' });
    }
  }, [ok, analyticsEvent, analyticsAdapter, eventId]);

  // add_to_cart once the count settles (1 s), not on every tap; only when something is picked.
  const cartKey = selectable
    .map((category) => `${category.categoryId}:${quantities[category.categoryId] ?? 0}`)
    .join(',');
  useEffect(() => {
    if (!analyticsEvent || selection.total === 0) return;
    const timer = window.setTimeout(() => {
      const picked = selectable.filter((category) => (quantities[category.categoryId] ?? 0) > 0);
      analyticsAdapter.trackEvent(ANALYTICS_EVENTS.ADD_TO_CART, {
        event_id: eventId,
        currency: ANALYTICS_CURRENCY,
        value: picked.reduce(
          (sum, category) => sum + category.price.amount * (quantities[category.categoryId] ?? 0),
          0,
        ),
        items: picked.map((category) => categoryItem(category, analyticsEvent, quantities[category.categoryId])),
      });
    }, ADD_TO_CART_SETTLE_MS);
    return () => window.clearTimeout(timer);
    // cartKey stands for the quantities: a new object each render, so it is not a dependency itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, analyticsEvent]);

  // holders_complete once per set of tickets, when every holder is verified.
  const holdersTrackedFor = useRef<string | null>(null);
  const slotsKey = selection.slots.map((slot) => slot.key).join(',');
  useEffect(() => {
    if (!allHoldersVerified || holdersTrackedFor.current === slotsKey) return;
    holdersTrackedFor.current = slotsKey;
    analyticsAdapter.trackEvent(ANALYTICS_EVENTS.HOLDERS_COMPLETE, {
      event_id: eventId,
      ticket_count: selection.total,
    });
  }, [allHoldersVerified, slotsKey, selection.total, analyticsAdapter, eventId]);

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

  const signInHref = withQuery(ROUTES.LOGIN, { next: withQuery(ROUTES.ORDER, { event: eventId }) });

  // FR-16-W1: createBooking → enterPayment as one async operation (the use case sequences the calls). The overlay
  // freezes the selection the hold read; nothing here retries on its own (the buyer taps "Coba lagi").
  const holdMutation = useMutationTanstack<HoldBookingResult, HttpError, HoldBookingInput>({
    mutationKey: [MUTATION_KEYS.ORDER_HOLD],
    retry: false,
    mutationFn: (input) => {
      toggleLoading();
      return holdBookingUseCase.execute(input);
    },
    onSuccess: (result) => {
      toggleLoading();
      if (result.kind === 'held') {
        setLeaving(true);
        redirected.current = true;
        // Tracking plan §2 step 10: the tickets are held and the 10-minute payment window starts.
        if (ok) {
          const held = holdBookingUseCase.quote(ok.categories, quantities, ok.adminFee.amount);
          const picked = ok.categories.filter((category) => (quantities[category.categoryId] ?? 0) > 0);
          analyticsAdapter.trackEvent(ANALYTICS_EVENTS.BEGIN_CHECKOUT, {
            event_id: eventId,
            booking_id: result.bookingId,
            currency: ANALYTICS_CURRENCY,
            value: held.total,
            items: analyticsEvent
              ? picked.map((category) => categoryItem(category, analyticsEvent, quantities[category.categoryId]))
              : [],
          });
        }
        router.push(withQuery(ROUTES.PAYMENT, { booking: result.bookingId }));
        return;
      }
      holdGuard.current = false;
      switch (result.kind) {
        case 'not-verified':
          return;
        case 'nik-conflict':
        case 'attendees-stale': {
          const code = result.kind === 'nik-conflict' ? result.code : 'ATTENDEE_NOT_VALIDATED';
          // Tracking plan §3: a NIK the hold refused, by reason only (never the NIK).
          if (result.kind === 'nik-conflict') {
            analyticsAdapter.trackEvent(ANALYTICS_EVENTS.NIK_REJECTED, { event_id: eventId, reason: result.code });
          }
          const values = formApi.getValues('holders');
          const marked = result.kind === 'nik-conflict' ? result.slotIndexes : [];
          // Slot known: that field shows the existing seat-taken / duplicate error. Otherwise every holder rechecks.
          const slots =
            marked.length > 0
              ? marked.flatMap((i) => (selection.slots[i] ? [selection.slots[i]] : []))
              : selection.slots;
          setChecks((prev) => {
            const next = { ...prev };
            for (const slot of slots) {
              const entry = values.find((holder) => holder.slotKey === slot.key);
              const nik = entry?.nik ?? '';
              const fullName = entry?.fullName ?? '';
              next[slot.key] =
                marked.length > 0
                  ? {
                      nik,
                      fullName,
                      phase: 'done',
                      result: { kind: code === 'NIK_SEAT_TAKEN' ? 'seat-taken' : 'duplicate' },
                    }
                  : { nik, fullName, phase: 'failed', code: 'ATTENDEE_NOT_VALIDATED' };
            }
            return next;
          });
          if (marked.length === 0) setHoldFlag({ kind: 'holders', code });
          return;
        }
        case 'sold-out':
          setHoldFlag({ kind: 'sold-out', categoryId: result.categoryId });
          void categoriesQuery.refetch();
          return;
        case 'over-reservation':
          setHoldFlag({ kind: 'over-reservation' });
          void categoriesQuery.refetch();
          return;
        case 'active-booking': {
          const { bookingId } = result;
          openPopupError(
            result.status === 'PAYMENT_PENDING' && bookingId
              ? {
                  message: t('error_account_has_active_booking'),
                  actionLabel: t('order_hold_open_active'),
                  onAction: () => {
                    setLeaving(true);
                    redirected.current = true;
                    router.push(withQuery(ROUTES.PAYMENT, { booking: bookingId }));
                  },
                }
              : { message: t('error_account_has_active_booking') },
          );
          return;
        }
        case 'not-held':
          attemptRef.current = null;
          openPopupError({ message: t('error_booking_not_held') });
          return;
        case 'admission-invalid':
          if (redirected.current) return;
          redirected.current = true;
          router.replace(withQuery(ROUTES.QUEUE, { event: eventId }));
          return;
        case 'unauthorized':
          router.push(signInHref);
          return;
        case 'retryable':
          if (attemptRef.current) attemptRef.current = { ...attemptRef.current, bookingId: result.bookingId };
          openPopupError({
            message: t(ERROR_CODE_MAP[result.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR),
            reference: result.requestId,
            actionLabel: t('action_retry'),
            onAction: () => continueRef.current(),
          });
          return;
      }
    },
    // No reportError: the HTTP adapter already reports 5xx, and the error's cause holds the validation tokens.
    onError: (error) => {
      toggleLoading();
      holdGuard.current = false;
      if (error.status === 401 || error.code === 'UNAUTHORIZED') {
        router.push(signInHref);
        return;
      }
      openPopupError({
        message: t(ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR),
        reference: error.requestId,
      });
    },
  });

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

  // A render-time update (as the anchor above), so the sheet shows in the same frame as "0:00"; the guard stops a loop.
  const windowOver = status === 'ready' && secondsLeft === 0;
  // FR-19-W1: a reload's re-claim found the turn over: the same time's-up state, without a ready page under it.
  const windowEnded = categoriesData?.kind === 'window-ended';
  // FR-16-W1: never while a hold is in flight or after it succeeded; a hold that fails after zero re-renders the page
  // (the mutation's state changes) and the latch fires then.
  if ((windowOver || windowEnded) && !expired && !leaving && !holdMutation.isPending) setExpired(true);

  // Once per visit: end the window on this device and block every later admission-invalid redirect (the buyer leaves
  // through the sheet). The use case is synchronous and local (spec 61), not async work for TanStack.
  const ended = useRef(false);
  useEffect(() => {
    if (!expired || ended.current) return;
    ended.current = true;
    redirected.current = true;
    endOrderWindowUseCase.execute(eventId);
    analyticsAdapter.trackEvent('order_time_up', { eventId, tickets: selection.total });
  }, [expired, endOrderWindowUseCase, analyticsAdapter, eventId, selection.total]);

  // FR-16-W1: the summary and the "Lanjut ke pembayaran" state.
  const quote = useMemo(
    () => (ok ? holdBookingUseCase.quote(ok.categories, quantities, ok.adminFee.amount) : null),
    [holdBookingUseCase, ok, quantities],
  );
  const showCheckout = status === 'ready' && selection.total >= 1 && !expired;
  const soldOutBlocks =
    holdFlag?.kind === 'sold-out' && (holdFlag.categoryId === null || (quantities[holdFlag.categoryId] ?? 0) > 0);
  const flagBlocks = holdFlag?.kind === 'over-reservation' || soldOutBlocks;
  const busy = holdMutation.isPending || leaving;
  const enabled = showCheckout && allHoldersVerified && (secondsLeft ?? 0) > 0 && !busy && !flagBlocks;
  const { mutate: mutateHold } = holdMutation;

  const onContinue = useCallback(() => {
    if (!enabled || holdGuard.current) return;
    holdGuard.current = true;
    // Slot order; the token only from a valid check of exactly the values in the form.
    const values = formApi.getValues('holders');
    const tickets: HoldTicket[] = selection.slots.map((slot) => {
      const entry = values.find((holder) => holder.slotKey === slot.key);
      const run = checks[slot.key];
      const validationToken =
        run?.phase === 'done' &&
        run.result.kind === 'valid' &&
        run.nik === entry?.nik &&
        run.fullName === entry?.fullName
          ? run.result.validationToken
          : '';
      return { categoryId: slot.categoryId, validationToken, nikLast4: entry?.nik.slice(-4) ?? '' };
    });
    const signature = tickets.map((ticket) => `${ticket.categoryId}:${ticket.validationToken}`).join('|');
    if (attemptRef.current?.signature !== signature) {
      attemptRef.current = { signature, idempotencyKey: randomUuid(), bookingId: null };
    }
    const { idempotencyKey, bookingId } = attemptRef.current;
    setHoldFlag(null);
    mutateHold({ eventId, admissionToken: admissionStore.get(eventId), idempotencyKey, tickets, bookingId });
  }, [enabled, formApi, selection.slots, checks, eventId, admissionStore, mutateHold]);

  useEffect(() => {
    continueRef.current = onContinue;
  });

  let hint: OrderCheckoutHint | null = null;
  if (!enabled && !busy) {
    const soldOutName =
      holdFlag?.kind === 'sold-out' && holdFlag.categoryId !== null
        ? ok?.categories.find((category) => category.categoryId === holdFlag.categoryId)?.name
        : undefined;
    if (soldOutBlocks) {
      hint = {
        text: soldOutName ? t('order_hold_sold_out', { category: soldOutName }) : t(ERROR_CODE_MAP.CATEGORY_SOLD_OUT),
        error: true,
      };
    } else if (holdFlag?.kind === 'over-reservation') {
      hint = { text: t('order_hold_over_reservation'), error: true };
    } else if (!allHoldersVerified && holdFlag?.kind === 'holders') {
      hint = { text: t(ERROR_CODE_MAP[holdFlag.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR), error: true };
    } else if (!allHoldersVerified) {
      hint = { text: t('order_checkout_hint_holders'), error: false };
    }
  }

  const summary: OrderSummaryView | null =
    showCheckout && quote
      ? {
          heading: t('order_summary_heading'),
          lines: quote.lines.map((line) => ({
            key: line.categoryId,
            label: t('order_summary_line', { quantity: line.quantity, category: line.name }),
            amount: formatRupiah(line.lineTotal, locale),
          })),
          feeLabel: t('order_summary_fee'),
          fee: formatRupiah(quote.adminFee, locale),
          totalLabel: t('order_summary_total'),
          total: formatRupiah(quote.total, locale),
          note: t('order_summary_note'),
          ticketCount: t('order_summary_tickets', { count: quote.ticketCount }),
          dockLabel: t('order_summary_dock_label'),
        }
      : null;

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
    timeUp: expired,
    timeUpSheet: expired
      ? {
          stamp: t('order_time_up_stamp'),
          title: t('order_time_up_title'),
          body: t('order_time_up_body'),
          queueAgainLabel: t('order_time_up_queue_again'),
          homeLabel: t('action_back_home'),
          homeHref: ROUTES.HOME,
          queueAgain: () => {
            analyticsAdapter.trackEvent('queue_rejoin', { eventId, from: 'order' });
            router.replace(withQuery(ROUTES.QUEUE, { event: eventId }));
          },
        }
      : null,
    summary,
    checkout: summary
      ? {
          label: t('order_checkout_label'),
          shortLabel: t('order_checkout_short_label'),
          enabled,
          busy,
          hint,
          onContinue,
        }
      : null,
  };
};

export default OrderController;
