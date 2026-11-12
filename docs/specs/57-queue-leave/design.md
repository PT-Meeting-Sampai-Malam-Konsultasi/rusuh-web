# Design Document

```ts
type LeaveQueueResult = { kind: 'left' };

interface QueueLeaveView {
  open: boolean;
  body: string;
  leaving: boolean;
  ask: () => void;
  stay: () => void;
  confirm: () => void;
}

interface QueueLeftView {
  lead: string;
  body: string;
}

// QueueControllerInterface gains: leave: QueueLeaveView | null; left: QueueLeftView | null
// QueueStatus gains 'left' (set by the controller, like 'turn' and 'missed').
```

The controller keeps the number given up (`leftSeq`); while it is set, `following` and `atTurn` are false, so the
frontier, stream, turn window and claim stop. "Antre lagi" clears it and refetches the join with `rejoin`.

Screens: `QueueLeaveSheet` (dialog, focus on "Tetap antre", Escape), `QueueLeft` (verdict layout of `QueueMissed`),
`QueueNotes` passes the link to `NoteList`'s new `aside` cell (HiFi `.wr-notes .leave`, a 270px fourth column).

## Layer Constraints

- Use cases catch only the codes they classify and re-throw the rest; no strings or navigation.
- Controllers: one mutation per operation, `toggleLoading()` in `mutationFn`, `onSuccess` and `onError`; errors through
  `ERROR_CODE_MAP`; hooks from DI only.
- Sections get everything as props, including `t`; every `.tsx` has a co-located `.module.css` with `@reference`.
