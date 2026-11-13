/** Route paths (English); runtime ids go in search params because the site is a static export. */
export const ROUTES = {
  HOME: '/',
  QUEUE: '/queue',
  LOGIN: '/login',
  ORDER: '/order',
  PAYMENT: '/payment',
  TICKETS: '/tickets',
  TICKET_DETAIL: '/tickets/detail',
  ACCOUNT: '/account',
  TERMS: '/terms',
  PRIVACY: '/privacy',
  REFUND: '/refund',
  HELP: '/help',
} as const;

export const withQuery = (path: string, params: Record<string, string>) =>
  `${path}?${new URLSearchParams(params).toString()}`;
