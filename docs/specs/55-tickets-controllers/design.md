# Design Document

```ts
interface TicketsControllerInterface {
  t: TFunction;
  status: 'loading' | 'ready' | 'empty' | 'signed-out' | 'error';
  groups: { id: 'upcoming' | 'past'; title: string; summary: string; orders: MyOrderCardView[] }[];
  errorMessage: string;
  retry: () => void;
  signInHref: string;
  homeHref: string;
  locale: FormatLocale;
  setLocale: (locale: FormatLocale) => void;
  nav: NavItem[];
}

interface TicketDetailControllerInterface {
  t: TFunction;
  status: 'loading' | 'ready' | 'not-paid' | 'not-found' | 'error';
  ticket: (Omit<ETicketView, 'stubs' | 'calendar'> & { stubs: TicketStub[] }) | null;
  email: string;
  printTickets: () => void;
  calendar: {
    googleUrl: string;
    outlookUrl: string;
    downloadIcs: () => void;
    onPick: (via: 'google' | 'outlook' | 'ics') => void;
  } | null;
  errorMessage: string;
  retry: () => void;
  ticketsHref: string;
  locale: FormatLocale;
  setLocale: (locale: FormatLocale) => void;
  nav: NavItem[];
}
```

Formatting in `src/utils/format/tickets.ts` (`toMyOrderCardView`, `toETicketView`, `daysUntil`), the `.ics` and the
Google / Outlook links in `src/utils/calendar.ts`. Query keys `my-orders`, `booking`, `me`.

## Layer Constraints

- Factory functions with hooks from DI only; `export default`; registered per page, no `.singleton()`.
- One query per async operation; no mutation (printing and the calendar are local).
- Errors: `ERROR_CODE_MAP[code] ?? UNKNOWN_ERROR` → `t()`; 401 goes to sign-in.
- `trackPageView` in `useEffect(..., [])`.
