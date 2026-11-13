// Product analytics, as the shared tracking plan names it (rusuh-documentation/tech/analytics-tracking-plan.md).
// Web and Android send the same names and parameters, so one funnel covers both. Rename here and in the plan together.

import type { Category, PriceBreakdown } from '@core/entities/booking/booking.entity';
import type { EventSummary } from '@core/entities/catalog/catalog.entity';
import type { AnalyticsItem } from '@core/protocols/analytics.protocol';
import { ROUTES } from '@utils/constants/routes';

export const ANALYTICS_EVENTS = {
  // Funnel (plan §2). begin_checkout, add_payment_info and purchase come with the payment flow.
  VIEW_ITEM_LIST: 'view_item_list',
  SELECT_ITEM: 'select_item',
  QUEUE_JOIN: 'queue_join',
  QUEUE_TURN: 'queue_turn',
  QUEUE_CLAIM: 'queue_claim',
  LOGIN: 'login',
  SIGN_UP: 'sign_up',
  VIEW_ITEM: 'view_item',
  ADD_TO_CART: 'add_to_cart',
  HOLDERS_COMPLETE: 'holders_complete',
  BEGIN_CHECKOUT: 'begin_checkout',
  ADD_PAYMENT_INFO: 'add_payment_info',
  PURCHASE: 'purchase',
  VIEW_TICKET: 'view_ticket',
  // Exits (plan §3).
  QUEUE_LEAVE: 'queue_leave',
  QUEUE_REJOIN: 'queue_rejoin',
  SOLD_OUT_SEEN: 'sold_out_seen',
  ORDER_EXPIRED: 'order_expired',
  NIK_REJECTED: 'nik_rejected',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_EXPIRED: 'payment_expired',
  // After the purchase (plan §4).
  TICKET_DOWNLOAD: 'ticket_download',
  TICKET_ADD_CALENDAR: 'ticket_add_calendar',
} as const;

export const ANALYTICS_CURRENCY = 'IDR';

/** Where sign-in started (`login` / `sign_up` `from`). */
export type SignInFrom = 'queue' | 'order' | 'account' | 'tickets' | 'other';

const SIGN_IN_FROM: Record<string, SignInFrom> = {
  [ROUTES.QUEUE]: 'queue',
  [ROUTES.ORDER]: 'order',
  [ROUTES.ACCOUNT]: 'account',
  [ROUTES.TICKETS]: 'tickets',
  [ROUTES.TICKET_DETAIL]: 'tickets',
};

/** The `from` of `login` / `sign_up`: the screen sign-in returns to (`?next=`). */
export function signInFrom(next: string): SignInFrom {
  return SIGN_IN_FROM[next.split(/[?#]/)[0]] ?? 'other';
}

/** Places ahead, as a range: `1-100`, `101-1000`, `1001-10000`, `10000+` (plan §1). */
export function positionBucket(position: number): string {
  if (position <= 100) return '1-100';
  if (position <= 1000) return '101-1000';
  if (position <= 10000) return '1001-10000';
  return '10000+';
}

/** Seconds waited, as a range: `0-60`, `61-300`, `301-900`, `900+` (plan §1). */
export function waitBucket(seconds: number): string {
  if (seconds <= 60) return '0-60';
  if (seconds <= 300) return '61-300';
  if (seconds <= 900) return '301-900';
  return '900+';
}

/** An event in a list (`view_item_list`, `select_item`): item_id is the event (plan §5). */
export function eventItem(event: EventSummary, index?: number): AnalyticsItem {
  return {
    item_id: event.eventId,
    item_name: event.name,
    ...(event.format ? { item_category: event.format } : {}),
    ...(event.priceFrom ? { price: event.priceFrom.amount } : {}),
    ...(index === undefined ? {} : { index }),
  };
}

/** A ticket category (`view_item` onwards): item_id is the category, item_category the event (plan §5). */
export function categoryItem(
  category: Category,
  event: { eventId: string; name: string },
  quantity?: number,
): AnalyticsItem {
  return {
    item_id: category.categoryId,
    item_name: category.name,
    item_category: event.eventId,
    item_brand: event.name,
    price: category.price.amount,
    ...(quantity === undefined ? {} : { quantity }),
  };
}

/** One item per price line (`add_payment_info`, `purchase`): item_id is the category (plan §5). */
export function priceItems(price: PriceBreakdown): AnalyticsItem[] {
  return price.lines.map((line) => ({
    item_id: line.categoryId,
    item_name: line.name,
    price: line.unitPrice.amount,
    quantity: line.quantity,
  }));
}
