# Design Document

```
src/app/tickets/page.tsx, detail/page.tsx, error.tsx
src/presentation/pages/Tickets/            index.tsx, tickets.module.css, components/OrderCard
src/presentation/pages/TicketDetail/       index.tsx, ticket-detail.module.css, components/TicketStub, TicketSkeleton
src/presentation/components/QrCode/
```

Phone first (390), `md` 720px, `lg` 1180px, as the HiFi breakpoints. The QR stays black on white on every theme.

## Layer Constraints

- Route files are server components; shells resolve their controller unconditionally and pass props.
- Sections get everything as props, including `t`; no `useTranslation()` or `container.resolve()`.
- Every `.tsx` has a co-located `.module.css` starting with `@reference`; no Tailwind classes in JSX.
