/** TanStack Query keys. Features add theirs here; keep one key per resource. */
export const QUERY_KEYS = {
  EVENTS: 'events',
  EVENT: 'event',
  CATEGORIES: 'categories',
  QUEUE_PLACE: 'queue-place',
  QUEUE_FRONTIER: 'queue-frontier',
  QUEUE_TURN: 'queue-turn',
  QUEUE_CLAIM: 'queue-claim',
  ME: 'me',
  MY_ORDERS: 'my-orders',
  BOOKING: 'booking',
  PAYMENT: 'payment',
  PAYMENT_STATUS: 'payment-status',
  SNAP_SCRIPT: 'snap-script',
} as const;

/** TanStack mutation keys; tests tell mutations apart by them. */
export const MUTATION_KEYS = {
  ORDER_HOLD: 'order-hold',
  PAYMENT_PAY: 'payment-pay',
} as const;
