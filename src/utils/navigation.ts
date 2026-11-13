import type { TFunction } from 'i18next';

import { ROUTES } from '@utils/constants/routes';

export type NavIcon = 'events' | 'queue' | 'tickets' | 'account';

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  current: boolean;
  /** Shown in the desktop header too (the queue tab is phone-only). */
  desktop: boolean;
}

/** The app's main navigation (desktop header and phone tab bar), with `current` marking the open section. */
export function mainNav(t: TFunction, current: NavIcon | null): NavItem[] {
  const item = (icon: NavIcon, href: string, label: string, desktop: boolean): NavItem => ({
    href,
    label: t(label),
    icon,
    current: icon === current,
    desktop,
  });
  return [
    item('events', ROUTES.HOME, 'nav_events', true),
    item('queue', ROUTES.QUEUE, 'nav_queue', false),
    item('tickets', ROUTES.TICKETS, 'nav_tickets', true),
    item('account', ROUTES.ACCOUNT, 'nav_account', true),
  ];
}
