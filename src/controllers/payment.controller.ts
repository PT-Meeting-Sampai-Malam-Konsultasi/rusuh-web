import { useCallback, useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';

import type { PaymentStatus, PaymentView, SnapTransaction } from '@core/entities/payment/payment.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type {
  InactiveOutcome,
  PayInput,
  PayResult,
  PaymentPageResult,
  PaymentStep,
  PaymentTicketLine,
  SnapHint,
} from '@core/use_case/payment/pay-booking.use-case';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';
import { ANALYTICS_CURRENCY, ANALYTICS_EVENTS, priceItems } from '@utils/analytics';
import { MUTATION_KEYS, QUERY_KEYS } from '@utils/constants/query-keys';
import { ROUTES, withQuery } from '@utils/constants/routes';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';
import { formatEventDay, type FormatLocale } from '@utils/format/date';
import { formatRupiah } from '@utils/format/number';

export type PaymentScreenState =
  | 'loading'
  | 'ready'
  | 'opening'
  | 'verifying'
  | 'failed'
  | 'busy'
  | 'inactive'
  | 'expired'
  | 'not-found'
  | 'error'
  | 'leaving';

/** FlowHeader step; `done` draws "✓" (spec 78 adds it to FlowHeaderStep). */
export interface PaymentFlowStep {
  number: 1 | 2 | 3;
  label: string;
  current: boolean;
  done: boolean;
}

export interface PaymentSummaryLine {
  /** `${index}`: attendees can repeat a category. */
  key: string;
  /** "Festival B". */
  category: string;
  /** "NIK 3174 •••• •••• 0004". */
  nik: string;
  /** "Rp 850.000"; '' when the price is unknown. */
  amount: string;
}

/** The "Pesanan" aside (trust zone: quiet). */
export interface PaymentSummaryView {
  /** "Pesanan" / "Order". */
  heading: string;
  /** "RSH-26-084731". */
  orderCode: string;
  /** "SAMUDRA · Sab, 12 Des 2026 · GBK"; '' when the view has no event fields. */
  eventLine: string;
  lines: PaymentSummaryLine[];
  /** "Biaya layanan" / "Service fee". */
  feeLabel: string;
  /** Once per order (ADR-0010). */
  fee: string;
  totalLabel: string;
  total: string;
  /** "Pembayaran diproses oleh Midtrans. Rusuh tidak menyimpan data kartu Anda." */
  legal: string;
}

/** "Bayar" in the aside and the phone dock. */
export interface PaymentActionView {
  /** Aside button: "Bayar" · "Bayar lagi" · "Coba lagi" · "Buka lagi pembayaran". */
  label: string;
  /** Dock button: "Bayar Rp 2.160.000" (or the label above when it is not a first pay). */
  dockLabel: string;
  /** Dock region name: "Pembayaran" / "Payment". */
  dockRegionLabel: string;
  /** Shown while busy: "Membuka pembayaran…". */
  busyLabel: string;
  /** The mutation is pending (Snap opening or open). */
  busy: boolean;
  enabled: boolean;
  onPay: () => void;
}

export interface PaymentNotice {
  text: string;
  tone: 'error' | 'info';
}

/** Verifying / leaving panel (role="status"). */
export interface PaymentProgressView {
  reason: 'confirming' | 'waiting' | 'paid';
  title: string;
  body: string;
  /** "Tiket Anda tetap ditahan selama pengecekan ini."; '' when paid. */
  held: string;
}

/** Inactive / not-found / load error. */
export interface PaymentMessageView {
  title: string;
  body: string;
  /** H-4 refund note; null unless inactive with refund. */
  note: string | null;
  /** "Coba lagi" on the load error only. */
  actionLabel: string | null;
  onAction: (() => void) | null;
  homeHref: string;
  homeLabel: string;
}

export interface PaymentIntroView {
  /** "Bayar dengan Midtrans". */
  heading: string;
  body: string;
  note: string;
}

/** The payment-window countdown for the flow header (FR-21-W1): what the shared Timer component takes. */
export interface PaymentTimerView {
  /** Whole seconds left, rounded down, never negative. From server time plus elapsed client time. */
  seconds: number;
  /** "untuk membayar" / "left to pay". */
  label: string;
}

/** The "Waktu habis" screen (FR-23-W1, HiFi payment.html 84–90). Texts are translated. */
export interface PaymentExpiredView {
  /** "Waktu habis" / "Time's up" (Stamp uppercases it). */
  stamp: string;
  /** "Pesanan dibatalkan." / "Order cancelled." */
  title: string;
  /** With the held-ticket count, or the count-free text. */
  body: string;
  /** "Saldo terpotong?" shown bold before `note`; null when `note` is the definite refund text (it carries the lead). */
  noteLead: string | null;
  note: string;
  /** "Antre lagi" / "Queue again". */
  queueAgainLabel: string;
  /** Null when the event is unknown: the page hides the button. */
  onQueueAgain: (() => void) | null;
  /** ROUTES.HOME. */
  homeHref: string;
  /** "Ke beranda" / "Go home". */
  homeLabel: string;
}

export interface PaymentControllerInterface {
  t: TFunction;
  state: PaymentScreenState;
  steps: PaymentFlowStep[];
  /** App bar title: "Pembayaran". */
  title: string;
  /** Main column copy in ready / opening / failed / busy; null otherwise. */
  intro: PaymentIntroView | null;
  summary: PaymentSummaryView | null;
  pay: PaymentActionView | null;
  notice: PaymentNotice | null;
  progress: PaymentProgressView | null;
  message: PaymentMessageView | null;
  homeHref: string;
  backHref: string;
  locale: FormatLocale;
  setLocale: (locale: FormatLocale) => void;
  /** Null unless state is ready / opening / verifying / failed / busy and expiresAt / serverNow are valid dates. */
  timer: PaymentTimerView | null;
  /** Seconds left reached 0 in a timer state: "Bayar" is off and the page has asked the server again. */
  timeUp: boolean;
  /** Non-null exactly when state is 'expired' (FR-23-W1). */
  expired: PaymentExpiredView | null;
}

type PaymentControllerDeps = Pick<
  AwilixRegistry,
  | 'payBookingUseCase'
  | 'endOrderWindowUseCase'
  | 'snap'
  | 'analyticsAdapter'
  | 'storage'
  | 'ERROR_CODE_MAP'
  | 'useTranslation'
  | 'useQueryTanstack'
  | 'useMutationTanstack'
  | 'useRouterNext'
  | 'useSearchParamsNext'
  | 'usePopupError'
>;

/** `round` gives every verifying stretch its own status query, so a cached step of an earlier one is never replayed. */
type Phase =
  | { kind: 'ready' }
  | { kind: 'verifying'; hint: SnapHint; reason: 'confirming' | 'waiting'; round: number }
  | { kind: 'failed'; paymentStatus: PaymentStatus }
  | { kind: 'busy'; code: string }
  | { kind: 'inactive'; outcome: InactiveOutcome }
  | { kind: 'not-found' }
  | { kind: 'paid' };

/** The transaction "Bayar" reopens; `reusable: undefined` = take the view's currentSnap. */
interface Attempt {
  reusable: SnapTransaction | null | undefined;
}

/** The answer the countdown runs from: its server times and when it arrived (the query's dataUpdatedAt). */
/** The last real ready answer of this visit: survives the refetch that turns the page inactive. */
interface SeenOrder {
  view: PaymentView;
  tickets: PaymentTicketLine[];
}

interface TimerAnchor {
  expiresAt: string;
  serverNow: string;
  receivedAt: number;
}

const POLL_MS = 4000;

/** The states that show the order, so the payment countdown (HiFi: select, va, qris, verifying). */
const TIMER_STATES: ReadonlySet<PaymentScreenState> = new Set(['ready', 'opening', 'verifying', 'failed', 'busy']);

const PaymentController = ({
  payBookingUseCase,
  endOrderWindowUseCase,
  snap,
  analyticsAdapter,
  storage,
  ERROR_CODE_MAP,
  useTranslation,
  useQueryTanstack,
  useMutationTanstack,
  useRouterNext,
  useSearchParamsNext,
  usePopupError,
}: PaymentControllerDeps): PaymentControllerInterface => {
  const { t, i18n } = useTranslation();
  const locale: FormatLocale = i18n.language === 'en' ? 'en' : 'id';
  const router = useRouterNext();
  const { openPopupError } = usePopupError();
  const searchParams = useSearchParamsNext();
  const bookingId = searchParams.get('booking')?.trim() ?? '';
  const hasBookingId = bookingId !== '';

  const signInHref = withQuery(ROUTES.LOGIN, { next: withQuery(ROUTES.PAYMENT, { booking: bookingId }) });
  const eTicketHref = withQuery(ROUTES.TICKET_DETAIL, { booking: bookingId });

  useEffect(() => {
    analyticsAdapter.trackPageView('payment');
  }, [analyticsAdapter]);

  const pageQuery = useQueryTanstack<PaymentPageResult, HttpError>({
    queryKey: [QUERY_KEYS.PAYMENT, bookingId],
    queryFn: () => payBookingUseCase.load(bookingId),
    enabled: hasBookingId,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const loaded = pageQuery.data?.kind === 'ready' ? pageQuery.data : null;
  const view = loaded?.view ?? null;

  // The countdown's anchor (FR-21-W1) and the seen order (FR-23-W1): written only from a real answer, once per answer
  // (render-time update, guarded).
  const [anchor, setAnchor] = useState<TimerAnchor | null>(null);
  const [seen, setSeen] = useState<SeenOrder | null>(null);
  if (loaded && !pageQuery.isPlaceholderData && pageQuery.dataUpdatedAt !== anchor?.receivedAt) {
    setAnchor({
      expiresAt: loaded.view.expiresAt,
      serverNow: loaded.view.serverNow,
      receivedAt: pageQuery.dataUpdatedAt,
    });
    setSeen({ view: loaded.view, tickets: loaded.tickets });
  }

  // Preload snap.js so the tap opens Snap at once; a failure changes nothing (snap.pay loads it again on the tap).
  useQueryTanstack<boolean>({
    queryKey: [QUERY_KEYS.SNAP_SCRIPT],
    queryFn: async () => {
      await snap.load();
      return true;
    },
    enabled: view !== null,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  const attemptRef = useRef<Attempt>({ reusable: undefined });
  const payGuard = useRef(false);
  /** Snap tokens already tracked: in memory only, never sent anywhere. */
  const trackedAttempts = useRef<Set<string>>(new Set());
  const roundRef = useRef(0);

  const verifying = phase.kind === 'verifying' ? phase : null;

  const payMutation = useMutationTanstack<PayResult, HttpError, PayInput>({
    mutationKey: [MUTATION_KEYS.PAYMENT_PAY],
    retry: false,
    // No overlay: the mutation stays pending while the Snap popup is open; pay.busy shows it on the button.
    mutationFn: (input) => payBookingUseCase.pay(input),
    onSuccess: (result) => {
      payGuard.current = false;
      switch (result.kind) {
        case 'snap': {
          attemptRef.current = { ...attemptRef.current, reusable: result.snap };
          // Tracking plan §2 step 11: Snap opened for this attempt (once per attempt, never the token).
          if (view && !trackedAttempts.current.has(result.snap.snapToken)) {
            trackedAttempts.current.add(result.snap.snapToken);
            analyticsAdapter.trackEvent(ANALYTICS_EVENTS.ADD_PAYMENT_INFO, {
              booking_id: bookingId,
              currency: ANALYTICS_CURRENCY,
              value: view.price.total.amount,
              payment_type: 'midtrans_snap',
              items: priceItems(view.price),
            });
          }
          // A Snap callback is a hint only: the server's status decides paid (LLD-03 §4.3).
          if (result.outcome === 'closed') {
            setPhase({ kind: 'ready' });
            return;
          }
          roundRef.current += 1;
          setPhase({
            kind: 'verifying',
            hint: result.outcome,
            reason: result.outcome === 'pending' ? 'waiting' : 'confirming',
            round: roundRef.current,
          });
          return;
        }
        case 'paid':
          setPhase({ kind: 'paid' });
          return;
        case 'inactive':
          setPhase({ kind: 'inactive', outcome: result });
          return;
        case 'retryable':
          // snap null = ask enterPayment again on the retry, else reopen this one.
          attemptRef.current = { ...attemptRef.current, reusable: result.snap };
          setPhase({ kind: 'busy', code: result.code });
          return;
        case 'not-found':
          setPhase({ kind: 'not-found' });
          return;
        case 'unauthorized':
          router.replace(signInHref);
          return;
      }
    },
    onError: (error) => {
      payGuard.current = false;
      if (error.status === 401 || error.code === 'UNAUTHORIZED') {
        router.replace(signInHref);
        return;
      }
      openPopupError({
        message: t(ERROR_CODE_MAP[error.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR),
        reference: error.requestId,
      });
    },
  });
  const { mutate: mutatePay, isPending: paying } = payMutation;

  const statusQuery = useQueryTanstack<PaymentStep, HttpError>({
    queryKey: [QUERY_KEYS.PAYMENT_STATUS, bookingId, verifying?.hint ?? null, verifying?.round ?? 0],
    queryFn: () => payBookingUseCase.checkStatus(bookingId, view?.eventId ?? '', verifying?.hint ?? 'success'),
    enabled: verifying !== null,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    retry: false,
    gcTime: 0,
  });

  // Each step once (render-time update, as the order countdown's anchor): the server's answer moves the phase.
  const [handledAt, setHandledAt] = useState(0);
  const step = statusQuery.data;
  if (verifying && step && statusQuery.dataUpdatedAt !== handledAt) {
    setHandledAt(statusQuery.dataUpdatedAt);
    if (step.kind === 'paid') setPhase({ kind: 'paid' });
    else if (step.kind === 'failed') setPhase({ kind: 'failed', paymentStatus: step.paymentStatus });
    else if (step.kind === 'inactive') setPhase({ kind: 'inactive', outcome: step });
    else if (step.reason !== verifying.reason) setPhase({ ...verifying, reason: step.reason });
  }

  // A failed attempt: the next "Bayar" asks enterPayment for the live attempt (nothing to reopen). Once per failure.
  useEffect(() => {
    if (phase.kind !== 'failed') return;
    attemptRef.current = { reusable: null };
    analyticsAdapter.trackEvent(ANALYTICS_EVENTS.PAYMENT_FAILED, {
      booking_id: bookingId,
      reason: phase.paymentStatus,
    });
  }, [phase, analyticsAdapter, bookingId]);

  // Only the server's PAID leaves for the e-ticket; replace, so Back never reopens a paid payment page.
  const leaving = pageQuery.data?.kind === 'paid' || phase.kind === 'paid';
  const left = useRef(false);
  useEffect(() => {
    if (!leaving || left.current) return;
    left.current = true;
    // Tracking plan §2 step 12; not sent when the page opened already paid (no view to price it).
    if (view) {
      analyticsAdapter.trackEvent(ANALYTICS_EVENTS.PURCHASE, {
        transaction_id: bookingId,
        booking_id: bookingId,
        currency: ANALYTICS_CURRENCY,
        value: view.price.total.amount,
        items: priceItems(view.price),
      });
    }
    router.replace(eTicketHref);
  }, [leaving, view, analyticsAdapter, bookingId, router, eTicketHref]);

  const loadUnauthorized =
    pageQuery.data?.kind === 'unauthorized' || (pageQuery.isError && pageQuery.error?.status === 401);
  const signInNeeded = loadUnauthorized || (statusQuery.isError && statusQuery.error?.status === 401);
  const signedOut = useRef(false);
  useEffect(() => {
    if (!signInNeeded || signedOut.current) return;
    signedOut.current = true;
    router.replace(signInHref);
  }, [signInNeeded, router, signInHref]);

  const pageResult = pageQuery.data?.kind;
  // The page answer first: it is the latest server read after the FR-21 refetch.
  const ended: InactiveOutcome | null =
    pageQuery.data?.kind === 'inactive' ? pageQuery.data : phase.kind === 'inactive' ? phase.outcome : null;
  let state: PaymentScreenState;
  if (!hasBookingId) state = 'not-found';
  else if (pageQuery.isPending || loadUnauthorized) state = 'loading';
  else if (pageQuery.isError) state = 'error';
  else if (pageResult === 'not-found' || phase.kind === 'not-found') state = 'not-found';
  else if (ended) state = ended.reason === 'expired' ? 'expired' : 'inactive';
  else if (leaving) state = 'leaving';
  else if (paying) state = 'opening';
  else state = phase.kind as 'ready' | 'verifying' | 'failed' | 'busy';

  // Seconds left from server times only (expiresAt − serverNow) minus the client time elapsed since the answer.
  const [now, setNow] = useState(() => Date.now());
  const windowSeconds = anchor ? (Date.parse(anchor.expiresAt) - Date.parse(anchor.serverNow)) / 1000 : NaN;
  const secondsLeft =
    view && anchor && Number.isFinite(windowSeconds)
      ? Math.max(0, windowSeconds - Math.max(0, now - anchor.receivedAt) / 1000)
      : null;
  const showsTimer = secondsLeft !== null && TIMER_STATES.has(state);
  const timeUp = showsTimer && secondsLeft === 0;
  const ticking = secondsLeft !== null && secondsLeft > 0 && TIMER_STATES.has(state);
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  // The server decides expiry (ADR-0026): at the client's zero, ask again once per zero. 409 BOOKING_NOT_HELD →
  // inactive / paid through the use case; 200 with time left → re-anchor. payment_expired once per page visit.
  const { refetch: refetchPage } = pageQuery;
  const expiredTracked = useRef(false);
  useEffect(() => {
    if (!timeUp) return;
    void refetchPage();
    if (expiredTracked.current) return;
    expiredTracked.current = true;
    analyticsAdapter.trackEvent(ANALYTICS_EVENTS.PAYMENT_EXPIRED, { booking_id: bookingId });
  }, [timeUp, refetchPage, analyticsAdapter, bookingId]);

  const onPay = useCallback(() => {
    if (!view || timeUp || payGuard.current || paying) return;
    payGuard.current = true;
    const { reusable } = attemptRef.current;
    mutatePay({
      bookingId,
      eventId: view.eventId,
      reusable: reusable === undefined ? (view.currentSnap ?? null) : reusable,
    });
  }, [view, timeUp, paying, mutatePay, bookingId]);

  const refund = ended?.refund ?? false;

  // "Antre lagi" (FR-23-W1): forget this device's ended turn, then the back of the queue (A-10). Once per visit.
  const rejoined = useRef(false);
  const eventId = ended?.eventId ?? null;
  const onQueueAgain = useCallback(() => {
    if (!eventId || rejoined.current) return;
    rejoined.current = true;
    endOrderWindowUseCase.execute(eventId);
    analyticsAdapter.trackEvent(ANALYTICS_EVENTS.QUEUE_REJOIN, { eventId, from: 'payment' });
    router.replace(withQuery(ROUTES.QUEUE, { event: eventId }));
  }, [eventId, endOrderWindowUseCase, analyticsAdapter, router]);

  const steps: PaymentFlowStep[] = [
    { number: 1, label: t('order_step_choose'), current: false, done: true },
    { number: 2, label: t('order_step_pay'), current: true, done: false },
    { number: 3, label: t('order_step_ticket'), current: false, done: false },
  ];

  const showsOrder = ['ready', 'opening', 'verifying', 'failed', 'busy', 'leaving', 'expired'].includes(state);
  const order = state === 'expired' ? seen : loaded;
  const total = view ? formatRupiah(view.price.total.amount, locale) : '';
  const summary: PaymentSummaryView | null =
    order && showsOrder
      ? {
          heading: t('payment_summary_heading'),
          orderCode: order.view.orderCode,
          eventLine: [
            order.view.eventName?.toLocaleUpperCase(locale),
            order.view.eventStartsAt ? formatEventDay(order.view.eventStartsAt, locale, order.view.timezone) : '',
            order.view.venueShort,
          ]
            .filter(Boolean)
            .join(' · '),
          lines: order.tickets.map((ticket, index) => ({
            key: String(index),
            category: ticket.categoryName,
            nik: t('payment_summary_nik', { nik: ticket.nikMasked }),
            amount: ticket.unitPrice === null ? '' : formatRupiah(ticket.unitPrice, locale),
          })),
          feeLabel: t('order_summary_fee'),
          fee: formatRupiah(order.view.price.adminFee.amount, locale),
          totalLabel: t('order_summary_total'),
          total: formatRupiah(order.view.price.total.amount, locale),
          legal: t('payment_legal'),
        }
      : null;

  const intro: PaymentIntroView | null = ['ready', 'opening', 'failed', 'busy'].includes(state)
    ? { heading: t('payment_heading'), body: t('payment_intro'), note: t('payment_intro_note') }
    : null;

  const showsPay =
    view !== null &&
    (['ready', 'opening', 'failed', 'busy'].includes(state) ||
      (state === 'verifying' && verifying?.reason === 'waiting'));
  let payLabel = t('payment_pay_label');
  if (phase.kind === 'failed') payLabel = t('payment_pay_again');
  else if (phase.kind === 'busy') payLabel = t('action_retry');
  else if (verifying?.reason === 'waiting') payLabel = t('payment_pay_reopen');
  const pay: PaymentActionView | null = showsPay
    ? {
        label: payLabel,
        dockLabel: phase.kind === 'ready' ? t('payment_pay_amount', { amount: total }) : payLabel,
        dockRegionLabel: t('payment_dock_label'),
        busyLabel: t('payment_pay_busy'),
        busy: paying,
        enabled: !paying && !timeUp,
        onPay,
      }
    : null;

  let notice: PaymentNotice | null = null;
  if (state === 'failed') notice = { text: t('payment_failed'), tone: 'error' };
  else if (state === 'busy' && phase.kind === 'busy') {
    notice = { text: t(ERROR_CODE_MAP[phase.code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR), tone: 'error' };
  }

  let progress: PaymentProgressView | null = null;
  if (state === 'leaving') {
    progress = { reason: 'paid', title: t('payment_paid_title'), body: t('payment_paid_body'), held: '' };
  } else if (state === 'verifying' && verifying?.reason === 'waiting') {
    progress = {
      reason: 'waiting',
      title: t('payment_waiting_title'),
      body: t('payment_waiting_body'),
      held: t('payment_verifying_held'),
    };
  } else if (state === 'verifying') {
    progress = {
      reason: 'confirming',
      title: t('payment_verifying_title'),
      body: t('payment_verifying_body'),
      held: t('payment_verifying_held'),
    };
  }

  const timer: PaymentTimerView | null = showsTimer
    ? { seconds: Math.floor(secondsLeft), label: t('payment_timer_label') }
    : null;

  const home = { homeHref: ROUTES.HOME, homeLabel: t('action_back_home') };
  let message: PaymentMessageView | null = null;
  if (state === 'inactive') {
    message = {
      title: t('payment_inactive_title'),
      body: t('payment_inactive_body'),
      note: refund ? t('payment_inactive_refund') : null,
      actionLabel: null,
      onAction: null,
      ...home,
    };
  } else if (state === 'not-found') {
    message = {
      title: t('payment_not_found_title'),
      body: t('payment_not_found_body'),
      note: null,
      actionLabel: null,
      onAction: null,
      ...home,
    };
  } else if (state === 'error') {
    const code = pageQuery.error?.code ?? 'UNKNOWN_ERROR';
    message = {
      title: t('payment_error_title'),
      body: t(ERROR_CODE_MAP[code] ?? ERROR_CODE_MAP.UNKNOWN_ERROR),
      note: null,
      actionLabel: t('action_retry'),
      onAction: () => void pageQuery.refetch(),
      ...home,
    };
  }

  const count = ended?.ticketCount || seen?.tickets.length || null;
  const email = seen?.view.customerEmail?.trim() || null;
  const expired: PaymentExpiredView | null =
    state === 'expired' && ended
      ? {
          stamp: t('payment_expired_stamp'),
          title: t('payment_expired_title'),
          body: count ? t('payment_expired_body', { count }) : t('payment_expired_body_unknown'),
          noteLead: ended.refund ? null : t('payment_expired_note_lead'),
          note: ended.refund
            ? t('payment_inactive_refund')
            : email
              ? t('payment_expired_note_email', { email })
              : t('payment_expired_note_account'),
          queueAgainLabel: t('payment_expired_queue_again'),
          onQueueAgain: eventId ? onQueueAgain : null,
          ...home,
        }
      : null;

  return {
    t,
    state,
    steps,
    title: t('payment_title'),
    intro,
    summary,
    pay,
    notice,
    progress,
    message,
    homeHref: ROUTES.HOME,
    backHref: ROUTES.HOME,
    locale,
    setLocale: (next) => {
      storage.set(STORAGE_KEYS.LANGUAGE, next);
      void i18n.changeLanguage(next);
    },
    timer,
    timeUp,
    expired,
  };
};

export default PaymentController;
