import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod/mini';
import type { TFunction } from 'i18next';

import type { User } from '@core/entities/auth/auth.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { HttpError } from '@core/protocols/http.protocol';
import type { OrderCategoriesResult } from '@core/use_case/booking/get-order-categories.use-case';
import type { HolderType, TicketQuantities } from '@core/use_case/booking/order-ticket-selection.use-case';
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
}

export interface OrderHolderNikField {
  id: string;
  /** Raw digits while focused; masked ("3174 •••• •••• 0004") otherwise. */
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
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
}

type OrderControllerDeps = Pick<
  AwilixRegistry,
  | 'catalogService'
  | 'accountService'
  | 'getOrderCategoriesUseCase'
  | 'orderTicketSelectionUseCase'
  | 'admissionStore'
  | 'analyticsAdapter'
  | 'storage'
  | 'ERROR_CODE_MAP'
  | 'useTranslation'
  | 'useQueryTanstack'
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
      /** Digits only, kept by toNikDigits on change; format rules are FR-15-W1. */
      nik: z.string(),
    }),
  ),
});
type HoldersValues = z.infer<typeof holdersSchema>;

/** Stable empty list for summarize before the categories load (constant, not mutable state). */
const NO_CATEGORIES: readonly [] = [];
/** No-op handler for a holder view whose form entry is missing (not expected after reconcileHolders). */
const IGNORE = () => {};

const OrderController = ({
  catalogService,
  accountService,
  getOrderCategoriesUseCase,
  orderTicketSelectionUseCase,
  admissionStore,
  analyticsAdapter,
  storage,
  ERROR_CODE_MAP,
  useTranslation,
  useQueryTanstack,
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

  const applyQuantities = (next: TicketQuantities) => {
    setQuantities(next);
    const nextSlots = orderTicketSelectionUseCase.summarize(selectable, next, limit).slots;
    formApi.setValue('holders', orderTicketSelectionUseCase.reconcileHolders(formApi.getValues('holders'), nextSlots));
  };

  const holders = useMemo<OrderHolderView[]>(
    () =>
      selection.slots.map((slot) => {
        const index = holderValues.findIndex((holder) => holder.slotKey === slot.key);
        const entry = index >= 0 ? holderValues[index] : null;
        const holderType: OrderHolderType = entry?.holderType ?? 'other';
        const readOnly = holderType === 'self' && showHolderChoice;
        const digits = entry?.nik ?? '';
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
                if (result.kind === 'changed') formApi.setValue('holders', result.holders);
              }
            : IGNORE,
          name: {
            id: `order-holder-${slot.key}-name`,
            value: entry?.fullName ?? '',
            readOnly,
            hint: t(readOnly ? 'order_holder_name_hint_profile' : 'order_holder_name_hint'),
            onChange: entry && !readOnly ? (value) => formApi.setValue(`holders.${index}.fullName`, value) : IGNORE,
          },
          nik: {
            id: `order-holder-${slot.key}-nik`,
            value: focusedNik === slot.key ? digits : maskNik(digits),
            onChange: entry ? (value) => formApi.setValue(`holders.${index}.nik`, toNikDigits(value)) : IGNORE,
            onFocus: () => setFocusedNik(slot.key),
            onBlur: () => setFocusedNik((current) => (current === slot.key ? null : current)),
          },
        };
      }),
    [orderTicketSelectionUseCase, formApi, selection.slots, holderValues, focusedNik, profileName, showHolderChoice, t],
  );

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
  };
};

export default OrderController;
