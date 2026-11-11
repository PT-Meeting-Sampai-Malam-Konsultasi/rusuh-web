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

const CATEGORIES: readonly SelectableCategory[] = Object.freeze([
  Object.freeze({ categoryId: 'A', name: 'Festival A' }),
  Object.freeze({ categoryId: 'B', name: 'Festival B' }),
  Object.freeze({ categoryId: 'C', name: 'Tribun Bawah' }),
  Object.freeze({ categoryId: 'D', name: 'Tribun Atas' }),
]);

const freeze = (quantities: Record<string, number>): TicketQuantities => Object.freeze({ ...quantities });

const entry = (slotKey: string, overrides: Partial<HolderEntry> = {}): HolderEntry =>
  Object.freeze({ slotKey, holderType: 'other' as const, fullName: '', nik: '', ...overrides });

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
        { categoryId: 'cat-vip', name: 'VIP' },
        { categoryId: 'cat', name: 'Reguler' },
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
        { slotKey: 'A-1', holderType: 'other', fullName: '', nik: '' },
        { slotKey: 'B-1', holderType: 'other', fullName: 'Budi', nik: '3201' },
      ]);
      expect(holders).toHaveLength(3);
    });

    it('returns no entries when there are no slots', () => {
      expect(useCase.reconcileHolders([entry('A-1')], [])).toEqual([]);
    });

    it('keeps earlier categories when a ticket is removed from a later one', () => {
      const before = Object.freeze([
        entry('B-1', { holderType: 'self', fullName: 'Nadia Saputri', nik: '3171' }),
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

    it('frees "Saya sendiri" when the self slot is removed', () => {
      const before = Object.freeze([
        entry('B-1', { fullName: 'Budi' }),
        entry('B-2', { holderType: 'self', fullName: 'Nadia Saputri' }),
      ]);
      const result = useCase.reconcileHolders(before, slotsOf(freeze({ B: 1, D: 1 })));
      expect(result.some((h) => h.holderType === 'self')).toBe(false);
      expect(result.every((h) => useCase.canChooseSelf(result, h.slotKey))).toBe(true);
    });
  });

  describe('canChooseSelf', () => {
    const holders = Object.freeze([entry('A-1', { holderType: 'self', fullName: 'Nadia' }), entry('B-1')]);

    it('is true on the slot that already is self', () => {
      expect(useCase.canChooseSelf(holders, 'A-1')).toBe(true);
    });

    it('is false on any other slot while one slot is self', () => {
      expect(useCase.canChooseSelf(holders, 'B-1')).toBe(false);
    });

    it('is true when no slot is self', () => {
      expect(useCase.canChooseSelf([entry('A-1'), entry('B-1')], 'B-1')).toBe(true);
    });
  });

  describe('setHolderType', () => {
    const PROFILE = 'Nadia Saputri';

    it('other → self: fills the trimmed profile name and keeps the nik', () => {
      const holders = Object.freeze([entry('A-1', { fullName: 'Typed', nik: '3171' }), entry('B-1', { nik: '3202' })]);
      const result = useCase.setHolderType(holders, 'A-1', 'self', '  Nadia Saputri ');
      expect(result).toEqual({
        kind: 'changed',
        holders: [
          { slotKey: 'A-1', holderType: 'self', fullName: 'Nadia Saputri', nik: '3171' },
          { slotKey: 'B-1', holderType: 'other', fullName: '', nik: '3202' },
        ],
      });
      expect(holders[0]).toEqual({ slotKey: 'A-1', holderType: 'other', fullName: 'Typed', nik: '3171' });
    });

    it('other → self while another slot is self: SELF_TAKEN (block, not move)', () => {
      const holders = Object.freeze([entry('A-1', { holderType: 'self', fullName: PROFILE }), entry('B-1')]);
      expect(useCase.setHolderType(holders, 'B-1', 'self', PROFILE)).toEqual({
        kind: 'unchanged',
        reason: 'SELF_TAKEN',
      });
    });

    it.each(['', '   '])('other → self with profile name %j: NO_PROFILE_NAME', (profileName) => {
      expect(useCase.setHolderType([entry('A-1')], 'A-1', 'self', profileName)).toEqual({
        kind: 'unchanged',
        reason: 'NO_PROFILE_NAME',
      });
    });

    it('self → other: clears the name and keeps the nik', () => {
      const holders = Object.freeze([entry('A-1', { holderType: 'self', fullName: PROFILE, nik: '3171' })]);
      expect(useCase.setHolderType(holders, 'A-1', 'other', PROFILE)).toEqual({
        kind: 'changed',
        holders: [{ slotKey: 'A-1', holderType: 'other', fullName: '', nik: '3171' }],
      });
    });

    it('self → other works even when the profile name is empty', () => {
      const holders = [entry('A-1', { holderType: 'self', fullName: PROFILE })];
      expect(useCase.setHolderType(holders, 'A-1', 'other', '').kind).toBe('changed');
    });

    it.each(['self', 'other'] as const)('%s → %s: SAME_TYPE', (type) => {
      expect(useCase.setHolderType([entry('A-1', { holderType: type })], 'A-1', type, PROFILE)).toEqual({
        kind: 'unchanged',
        reason: 'SAME_TYPE',
      });
    });

    it('unknown slot key: UNKNOWN_SLOT', () => {
      expect(useCase.setHolderType([entry('A-1')], 'Z-9', 'self', PROFILE)).toEqual({
        kind: 'unchanged',
        reason: 'UNKNOWN_SLOT',
      });
    });

    it('switching self from one slot to another takes two steps and never yields two self entries', () => {
      let holders: HolderEntry[] = [entry('A-1'), entry('B-1'), entry('D-1')];
      const apply = (slotKey: string, type: 'self' | 'other') => {
        const result = useCase.setHolderType(holders, slotKey, type, PROFILE);
        if (result.kind === 'changed') holders = result.holders;
        expect(holders.filter((h) => h.holderType === 'self').length).toBeLessThanOrEqual(1);
        return result.kind;
      };
      expect(apply('A-1', 'self')).toBe('changed');
      expect(apply('B-1', 'self')).toBe('unchanged');
      expect(apply('A-1', 'other')).toBe('changed');
      expect(apply('B-1', 'self')).toBe('changed');
      expect(holders.map((h) => h.holderType)).toEqual(['other', 'self', 'other']);
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
