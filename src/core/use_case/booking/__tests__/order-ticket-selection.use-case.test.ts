import { describe, expect, it } from 'vitest';

import {
  ORDER_MAX_TICKETS,
  OrderTicketSelectionUseCase,
  type HolderEntry,
  type SelectableCategory,
  type TicketQuantities,
} from '../order-ticket-selection.use-case';

// This use case calls no service (pure order rules), so there is no infrastructure error to propagate.

const useCase = OrderTicketSelectionUseCase();

const CATEGORIES: readonly SelectableCategory[] = Object.freeze<SelectableCategory[]>([
  Object.freeze({ categoryId: 'A', name: 'Festival A', availability: 'available' }),
  Object.freeze({ categoryId: 'B', name: 'Festival B', availability: 'available' }),
  Object.freeze({ categoryId: 'C', name: 'Tribun Bawah', availability: 'available' }),
  Object.freeze({ categoryId: 'D', name: 'Tribun Atas', availability: 'available' }),
]);

const freeze = (quantities: Record<string, number>): TicketQuantities => Object.freeze({ ...quantities });

const entry = (slotKey: string, overrides: Partial<HolderEntry> = {}): HolderEntry =>
  Object.freeze({ slotKey, fullName: '', nik: '', ...overrides });

const slotsOf = (quantities: TicketQuantities, limit = 3) => useCase.summarize(CATEGORIES, quantities, limit).slots;

describe('OrderTicketSelectionUseCase', () => {
  describe('orderLimit', () => {
    it.each([
      [3, 3, 3],
      [3, 2, 2],
      [3, 1, 1],
      [4, 3, 3],
      [5, 5, 3],
      [2, 3, 2],
      [3, undefined, 3],
      [3, Number.NaN, 3],
      [3, -1, 3],
      [3, 1.5, 3],
      [3, 0, 0],
      [undefined, 2, 2],
      [-2, 1, 1],
      [Number.NaN, Number.NaN, ORDER_MAX_TICKETS],
      [Number.POSITIVE_INFINITY, 2, 2],
    ])('maxTicketsPerOrder %s, reservedUnits %s → %s', (maxTicketsPerOrder, reservedUnits, expected) => {
      expect(
        useCase.orderLimit({ maxTicketsPerOrder, reservedUnits } as {
          maxTicketsPerOrder: number;
          reservedUnits: number;
        }),
      ).toBe(expected);
    });

    it('never exceeds createBooking.tickets.maxItems (3)', () => {
      expect(ORDER_MAX_TICKETS).toBe(3);
      expect(useCase.orderLimit({ maxTicketsPerOrder: 10, reservedUnits: 10 })).toBe(3);
    });
  });

  describe('summarize', () => {
    it('returns zero lines and no slots for empty quantities', () => {
      const selection = useCase.summarize(CATEGORIES, freeze({}), 3);
      expect(selection.total).toBe(0);
      expect(selection.slots).toEqual([]);
      expect(selection.lines).toEqual(
        CATEGORIES.map(({ categoryId }) => ({ categoryId, quantity: 0, canIncrement: true, canDecrement: false })),
      );
    });

    it('builds lines, total and slots in server order then ordinal (data models example)', () => {
      const selection = useCase.summarize(CATEGORIES, freeze({ D: 1, B: 2 }), 3);
      expect(selection.total).toBe(3);
      expect(selection.lines).toEqual([
        { categoryId: 'A', quantity: 0, canIncrement: false, canDecrement: false },
        { categoryId: 'B', quantity: 2, canIncrement: false, canDecrement: true },
        { categoryId: 'C', quantity: 0, canIncrement: false, canDecrement: false },
        { categoryId: 'D', quantity: 1, canIncrement: false, canDecrement: true },
      ]);
      expect(selection.slots).toEqual([
        { key: 'B-1', categoryId: 'B', categoryName: 'Festival B', ordinal: 1, index: 1 },
        { key: 'B-2', categoryId: 'B', categoryName: 'Festival B', ordinal: 2, index: 2 },
        { key: 'D-1', categoryId: 'D', categoryName: 'Tribun Atas', ordinal: 1, index: 3 },
      ]);
    });

    it('allows increment while the total is below the limit', () => {
      const selection = useCase.summarize(CATEGORIES, freeze({ A: 1 }), 2);
      expect(selection.lines.every((line) => line.canIncrement)).toBe(true);
    });

    it('ignores quantities whose category is not in the current response', () => {
      const selection = useCase.summarize(CATEGORIES, freeze({ A: 1, GONE: 2 }), 3);
      expect(selection.total).toBe(1);
      expect(selection.slots.map((slot) => slot.key)).toEqual(['A-1']);
      expect(selection.lines.every((line) => line.canIncrement)).toBe(true);
    });

    it('reads broken quantities (negative, fractional, NaN) as 0', () => {
      const selection = useCase.summarize(CATEGORIES, freeze({ A: -1, B: 1.5, C: Number.NaN, D: 1 }), 3);
      expect(selection.total).toBe(1);
      expect(selection.lines.map((line) => line.quantity)).toEqual([0, 0, 0, 1]);
      expect(selection.slots.map((slot) => slot.key)).toEqual(['D-1']);
    });

    it('gives unique keys for category ids that contain "-"', () => {
      const categories = Object.freeze([
        { categoryId: 'cat-vip', name: 'VIP', availability: 'available' as const },
        { categoryId: 'cat', name: 'Reguler', availability: 'available' as const },
      ]);
      const { slots } = useCase.summarize(categories, freeze({ 'cat-vip': 2, cat: 1 }), 3);
      const keys = slots.map((slot) => slot.key);
      expect(keys).toEqual(['cat-vip-1', 'cat-vip-2', 'cat-1']);
      expect(new Set(keys).size).toBe(keys.length);
      expect(slots.map((slot) => slot.index)).toEqual([1, 2, 3]);
    });

    it('returns no translated text on slots', () => {
      const [slot] = slotsOf(freeze({ A: 1 }));
      expect(Object.keys(slot).sort()).toEqual(['categoryId', 'categoryName', 'index', 'key', 'ordinal']);
    });
  });

  describe('increment', () => {
    it('adds one ticket to a known category without mutating the input', () => {
      const quantities = freeze({ B: 1 });
      expect(useCase.increment(CATEGORIES, quantities, 'B', 3)).toEqual({ kind: 'changed', quantities: { B: 2 } });
      expect(useCase.increment(CATEGORIES, quantities, 'A', 3)).toEqual({
        kind: 'changed',
        quantities: { A: 1, B: 1 },
      });
      expect(quantities).toEqual({ B: 1 });
    });

    it('refuses with LIMIT_REACHED when the total equals the limit', () => {
      expect(useCase.increment(CATEGORIES, freeze({ B: 2, D: 1 }), 'A', 3)).toEqual({
        kind: 'unchanged',
        reason: 'LIMIT_REACHED',
      });
      expect(useCase.increment(CATEGORIES, freeze({ A: 1 }), 'A', 1)).toEqual({
        kind: 'unchanged',
        reason: 'LIMIT_REACHED',
      });
      expect(useCase.increment(CATEGORIES, freeze({}), 'A', 0)).toEqual({
        kind: 'unchanged',
        reason: 'LIMIT_REACHED',
      });
    });

    it('refuses with UNKNOWN_CATEGORY for an id outside the response', () => {
      expect(useCase.increment(CATEGORIES, freeze({}), 'GONE', 3)).toEqual({
        kind: 'unchanged',
        reason: 'UNKNOWN_CATEGORY',
      });
    });

    it('does not count stale ids against the limit', () => {
      expect(useCase.increment(CATEGORIES, freeze({ GONE: 3 }), 'A', 3)).toEqual({
        kind: 'changed',
        quantities: { GONE: 3, A: 1 },
      });
    });
  });

  describe('decrement', () => {
    it('removes one ticket without mutating the input', () => {
      const quantities = freeze({ B: 2, D: 1 });
      expect(useCase.decrement(CATEGORIES, quantities, 'B')).toEqual({
        kind: 'changed',
        quantities: { B: 1, D: 1 },
      });
      expect(quantities).toEqual({ B: 2, D: 1 });
    });

    it('refuses with NONE_TO_REMOVE at 0 (missing key or explicit 0)', () => {
      expect(useCase.decrement(CATEGORIES, freeze({}), 'A')).toEqual({ kind: 'unchanged', reason: 'NONE_TO_REMOVE' });
      expect(useCase.decrement(CATEGORIES, freeze({ A: 0 }), 'A')).toEqual({
        kind: 'unchanged',
        reason: 'NONE_TO_REMOVE',
      });
    });

    it('refuses with UNKNOWN_CATEGORY for an id outside the response', () => {
      expect(useCase.decrement(CATEGORIES, freeze({ GONE: 1 }), 'GONE')).toEqual({
        kind: 'unchanged',
        reason: 'UNKNOWN_CATEGORY',
      });
    });
  });

  describe('stepper sequence', () => {
    it('keeps every quantity ≥ 0 and the total ≤ the limit over a scripted sequence', () => {
      const limit = 3;
      const steps: Array<['+' | '-', string]> = [
        ['+', 'A'],
        ['+', 'A'],
        ['-', 'C'],
        ['+', 'B'],
        ['+', 'D'],
        ['+', 'A'],
        ['-', 'A'],
        ['+', 'C'],
        ['-', 'A'],
        ['-', 'A'],
        ['-', 'A'],
        ['+', 'D'],
        ['+', 'D'],
        ['-', 'B'],
        ['-', 'B'],
        ['+', 'B'],
        ['+', 'GONE'],
        ['-', 'D'],
        ['+', 'C'],
        ['+', 'A'],
      ];
      let quantities: TicketQuantities = freeze({});
      for (const [op, id] of steps) {
        const result =
          op === '+'
            ? useCase.increment(CATEGORIES, quantities, id, limit)
            : useCase.decrement(CATEGORIES, quantities, id);
        if (result.kind === 'changed') quantities = freeze({ ...result.quantities });
        const { total, lines, slots } = useCase.summarize(CATEGORIES, quantities, limit);
        expect(lines.every((line) => line.quantity >= 0)).toBe(true);
        expect(total).toBeLessThanOrEqual(limit);
        expect(slots).toHaveLength(total);
        slots.forEach((slot, i) => expect(slot.index).toBe(i + 1));
      }
    });
  });

  describe('reconcileHolders', () => {
    it('keeps matching entries, drops stale ones and adds empty "other" entries, in slot order', () => {
      const holders = Object.freeze([
        entry('B-1', { fullName: 'Budi', nik: '3201' }),
        entry('B-2', { fullName: 'Sari', nik: '3202' }),
        entry('X-1', { fullName: 'Old', nik: '9999' }),
      ]);
      const result = useCase.reconcileHolders(holders, slotsOf(freeze({ A: 1, B: 1 })));
      expect(result).toEqual([
        { slotKey: 'A-1', fullName: '', nik: '' },
        { slotKey: 'B-1', fullName: 'Budi', nik: '3201' },
      ]);
      expect(holders).toHaveLength(3);
    });

    it('returns no entries when there are no slots', () => {
      expect(useCase.reconcileHolders([entry('A-1')], [])).toEqual([]);
    });

    it('keeps earlier categories when a ticket is removed from a later one', () => {
      const before = Object.freeze([
        entry('B-1', { fullName: 'Nadia Saputri', nik: '3171' }),
        entry('B-2', { fullName: 'Sari', nik: '3202' }),
        entry('D-1', { fullName: 'Dewi', nik: '3203' }),
      ]);
      const result = useCase.reconcileHolders(before, slotsOf(freeze({ B: 2 })));
      expect(result).toEqual([before[0], before[1]]);
    });

    it('keeps later entries when a ticket is added to an earlier category (index shifts)', () => {
      const before = Object.freeze([
        entry('B-1', { fullName: 'Budi', nik: '3201' }),
        entry('D-1', { fullName: 'Dewi', nik: '3203' }),
      ]);
      const slots = slotsOf(freeze({ A: 1, B: 1, D: 1 }));
      const result = useCase.reconcileHolders(before, slots);
      expect(result.map((h) => h.slotKey)).toEqual(['A-1', 'B-1', 'D-1']);
      expect(result[1]).toEqual(before[0]);
      expect(result[2]).toEqual(before[1]);
      expect(slots[2].index).toBe(3);
    });

    it('decrementing B from the data models example drops B-2 only', () => {
      const before = Object.freeze([
        entry('B-1', { nik: '1' }),
        entry('B-2', { nik: '2' }),
        entry('D-1', { nik: '3' }),
      ]);
      const next = useCase.decrement(CATEGORIES, freeze({ B: 2, D: 1 }), 'B');
      if (next.kind !== 'changed') throw new Error('expected changed');
      const result = useCase.reconcileHolders(before, slotsOf(next.quantities));
      expect(result.map((h) => [h.slotKey, h.nik])).toEqual([
        ['B-1', '1'],
        ['D-1', '3'],
      ]);
    });
  });

  describe('stock caps (FR-14)', () => {
    /** Design data models example: A sold out, B no cap, C cap 1, D invalid count (no cap). */
    const STOCK: readonly SelectableCategory[] = Object.freeze<SelectableCategory[]>([
      Object.freeze({ categoryId: 'A', name: 'Festival A', availability: 'sold_out', available: 0 }),
      Object.freeze({ categoryId: 'B', name: 'Festival B', availability: 'available' }),
      Object.freeze({ categoryId: 'C', name: 'Tribun Bawah', availability: 'almost_gone', available: 1 }),
      Object.freeze({ categoryId: 'D', name: 'Tribun Atas', availability: 'available', available: 2.5 }),
    ]);

    const IDS = ['A', 'B', 'C', 'D'] as const;

    type Row = [
      label: string,
      quantities: Record<string, number>,
      plus: boolean[],
      minus: boolean[],
      total: number,
      limitReached: boolean,
      reasons: Record<string, string>,
    ];

    const ROWS: Row[] = [
      ['empty', {}, [false, true, true, true], [false, false, false, false], 0, false, { A: 'SOLD_OUT' }],
      [
        'C at its cap',
        { C: 1 },
        [false, true, false, true],
        [false, false, true, false],
        1,
        false,
        { A: 'SOLD_OUT', C: 'STOCK_REACHED' },
      ],
      [
        'at the order limit',
        { B: 2, C: 1 },
        [false, false, false, false],
        [false, true, true, false],
        3,
        true,
        { A: 'SOLD_OUT', B: 'LIMIT_REACHED', C: 'LIMIT_REACHED', D: 'LIMIT_REACHED' },
      ],
      [
        'stale sold-out pick',
        { A: 1 },
        [false, true, true, true],
        [true, false, false, false],
        1,
        false,
        { A: 'SOLD_OUT' },
      ],
    ];

    it.each(ROWS)('summarize + increment: %s', (_label, raw, plus, minus, total, limitReached, reasons) => {
      const quantities = freeze(raw);
      const selection = useCase.summarize(STOCK, quantities, 3);
      expect(selection.total).toBe(total);
      expect(selection.limitReached).toBe(limitReached);
      expect(selection.lines.map((line) => line.canIncrement)).toEqual(plus);
      expect(selection.lines.map((line) => line.canDecrement)).toEqual(minus);
      expect(selection.lines.map((line) => line.quantity)).toEqual(IDS.map((id) => raw[id] ?? 0));
      IDS.forEach((id, i) => {
        const result = useCase.increment(STOCK, quantities, id, 3);
        // Property 5: canIncrement ⇔ increment changes.
        expect(result.kind === 'changed').toBe(selection.lines[i].canIncrement);
        if (reasons[id]) expect(result).toEqual({ kind: 'unchanged', reason: reasons[id] });
        else expect(result.kind).toBe('changed');
      });
      expect(quantities).toEqual(raw);
    });

    it.each(['available', 'almost_gone', 'paused'])(
      'availability %s with no valid count never blocks on its own',
      (availability) => {
        const categories = [{ categoryId: 'X', name: 'X', availability } as SelectableCategory];
        expect(useCase.summarize(categories, freeze({ X: 2 }), 3).lines[0].canIncrement).toBe(true);
        expect(useCase.increment(categories, freeze({ X: 2 }), 'X', 3)).toEqual({
          kind: 'changed',
          quantities: { X: 3 },
        });
      },
    );

    it.each([undefined, Number.NaN, -1, 1.5, '2' as never])('available %s adds no cap', (available) => {
      const categories = [{ categoryId: 'X', name: 'X', availability: 'almost_gone' as const, available }];
      expect(useCase.summarize(categories, freeze({ X: 2 }), 3).lines[0].canIncrement).toBe(true);
      expect(useCase.increment(categories, freeze({ X: 2 }), 'X', 3).kind).toBe('changed');
    });

    it('available 0 with availability "available" blocks with STOCK_REACHED', () => {
      const categories = [{ categoryId: 'X', name: 'X', availability: 'available' as const, available: 0 }];
      expect(useCase.summarize(categories, freeze({}), 3).lines[0]).toEqual({
        categoryId: 'X',
        quantity: 0,
        canIncrement: false,
        canDecrement: false,
      });
      expect(useCase.increment(categories, freeze({}), 'X', 3)).toEqual({
        kind: 'unchanged',
        reason: 'STOCK_REACHED',
      });
    });

    it('a valid count caps the category: increments stop at available', () => {
      const categories = [{ categoryId: 'X', name: 'X', availability: 'almost_gone' as const, available: 2 }];
      let quantities: TicketQuantities = freeze({});
      const kinds: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const result = useCase.increment(categories, quantities, 'X', 3);
        kinds.push(result.kind === 'changed' ? 'changed' : result.reason);
        if (result.kind === 'changed') quantities = freeze({ ...result.quantities });
      }
      expect(kinds).toEqual(['changed', 'changed', 'STOCK_REACHED']);
      expect(quantities).toEqual({ X: 2 });
    });

    describe('reason order: UNKNOWN_CATEGORY → SOLD_OUT → LIMIT_REACHED → STOCK_REACHED', () => {
      it('unknown id wins over everything', () => {
        expect(useCase.increment(STOCK, freeze({ B: 3 }), 'GONE', 0)).toEqual({
          kind: 'unchanged',
          reason: 'UNKNOWN_CATEGORY',
        });
      });

      it('sold out wins over the order limit', () => {
        expect(useCase.increment(STOCK, freeze({ B: 3 }), 'A', 3)).toEqual({ kind: 'unchanged', reason: 'SOLD_OUT' });
        expect(useCase.increment(STOCK, freeze({}), 'A', 0)).toEqual({ kind: 'unchanged', reason: 'SOLD_OUT' });
      });

      it('the order limit wins over the stock cap', () => {
        expect(useCase.increment(STOCK, freeze({ C: 1 }), 'C', 1)).toEqual({
          kind: 'unchanged',
          reason: 'LIMIT_REACHED',
        });
      });

      it('stock cap applies when below the limit', () => {
        expect(useCase.increment(STOCK, freeze({ C: 1 }), 'C', 3)).toEqual({
          kind: 'unchanged',
          reason: 'STOCK_REACHED',
        });
      });
    });

    it('decrement still removes a sold-out stale pick and a pick above available', () => {
      expect(useCase.decrement(STOCK, freeze({ A: 1 }), 'A')).toEqual({ kind: 'changed', quantities: { A: 0 } });
      const quantities = freeze({ C: 2 });
      const selection = useCase.summarize(STOCK, quantities, 3);
      expect(selection.lines[2]).toEqual({ categoryId: 'C', quantity: 2, canIncrement: false, canDecrement: true });
      expect(useCase.decrement(STOCK, quantities, 'C')).toEqual({ kind: 'changed', quantities: { C: 1 } });
      expect(quantities).toEqual({ C: 2 });
    });

    it('summarize never trims a stale pick above its cap', () => {
      const selection = useCase.summarize(STOCK, freeze({ A: 2, C: 1 }), 3);
      expect(selection.lines.map((line) => line.quantity)).toEqual([2, 0, 1, 0]);
      expect(selection.slots.map((slot) => slot.key)).toEqual(['A-1', 'A-2', 'C-1']);
    });

    it('keeps every quantity ≤ its cap and the total ≤ the limit over a scripted sequence', () => {
      const limit = 3;
      const caps: Record<string, number> = { A: 0, B: Number.POSITIVE_INFINITY, C: 1, D: Number.POSITIVE_INFINITY };
      const steps: Array<['+' | '-', string]> = [
        ['+', 'A'],
        ['+', 'C'],
        ['+', 'C'],
        ['+', 'A'],
        ['+', 'B'],
        ['-', 'C'],
        ['+', 'D'],
        ['+', 'D'],
        ['+', 'C'],
        ['+', 'B'],
        ['-', 'D'],
        ['+', 'C'],
        ['-', 'A'],
        ['+', 'C'],
        ['-', 'B'],
        ['+', 'D'],
      ];
      let quantities: TicketQuantities = freeze({});
      for (const [op, id] of steps) {
        const result =
          op === '+' ? useCase.increment(STOCK, quantities, id, limit) : useCase.decrement(STOCK, quantities, id);
        if (result.kind === 'changed') quantities = freeze({ ...result.quantities });
        const { total, lines } = useCase.summarize(STOCK, quantities, limit);
        lines.forEach((line) => expect(line.quantity).toBeLessThanOrEqual(caps[line.categoryId]));
        expect(total).toBeLessThanOrEqual(limit);
      }
      expect(quantities).toEqual({ B: 0, C: 1, D: 2 });
    });
  });

  describe('limit flags (FR-14)', () => {
    it.each([
      [3, 3, 2, false, false],
      [3, 3, 3, true, false],
      [3, 2, 2, true, true],
      [3, 1, 1, true, true],
      [3, 0, 0, false, true],
    ])(
      'maxTicketsPerOrder %s, reservedUnits %s, total %s → limitReached %s, limitBelowMax %s',
      (maxTicketsPerOrder, reservedUnits, total, limitReached, limitBelowMax) => {
        const limit = useCase.orderLimit({ maxTicketsPerOrder, reservedUnits });
        const selection = useCase.summarize(CATEGORIES, freeze({ B: total }), limit);
        expect(selection.total).toBe(total);
        expect(selection.limitReached).toBe(limitReached);
        expect(selection.limitBelowMax).toBe(limitBelowMax);
      },
    );

    it('a category at its cap alone never sets limitReached', () => {
      const categories = [{ categoryId: 'X', name: 'X', availability: 'almost_gone' as const, available: 1 }];
      const selection = useCase.summarize(categories, freeze({ X: 1 }), 3);
      expect(selection.lines[0].canIncrement).toBe(false);
      expect(selection.limitReached).toBe(false);
    });

    it('returns booleans only, no text', () => {
      const selection = useCase.summarize(CATEGORIES, freeze({}), 3);
      expect(Object.keys(selection).sort()).toEqual(['limitBelowMax', 'limitReached', 'lines', 'slots', 'total']);
    });
  });

  describe('statelessness', () => {
    it('does not carry state between calls or instances', () => {
      const first = useCase.summarize(CATEGORIES, freeze({ A: 3 }), 3);
      const second = useCase.summarize(CATEGORIES, freeze({ D: 1 }), 2);
      expect(first.slots.map((s) => s.key)).toEqual(['A-1', 'A-2', 'A-3']);
      expect(second.slots.map((s) => s.key)).toEqual(['D-1']);
      expect(second.slots[0].index).toBe(1);
      expect(OrderTicketSelectionUseCase().summarize(CATEGORIES, freeze({ A: 3 }), 3)).toEqual(first);
    });
  });
});
