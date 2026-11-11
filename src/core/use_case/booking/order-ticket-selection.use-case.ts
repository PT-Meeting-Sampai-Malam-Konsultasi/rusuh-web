import type { Category } from '@core/entities/booking/booking.entity';

/** `createBooking.tickets.maxItems` (N-1, ADR-0007): never more than 3 tickets per order. */
export const ORDER_MAX_TICKETS = 3;

export type SelectableCategory = Pick<Category, 'categoryId' | 'name'>;

/** Tickets per categoryId; a missing key is 0. */
export type TicketQuantities = Readonly<Record<string, number>>;

export interface OrderLimitInput {
  maxTicketsPerOrder: number;
  reservedUnits: number;
}

export interface TicketLine {
  categoryId: string;
  quantity: number;
  canIncrement: boolean;
  canDecrement: boolean;
}

export interface TicketSlot {
  /** `${categoryId}-${ordinal}`: stable while the slot exists. */
  key: string;
  categoryId: string;
  categoryName: string;
  /** 1-based within the category. */
  ordinal: number;
  /** 1-based over the order: the n in "Tiket n". */
  index: number;
}

export interface TicketSelection {
  total: number;
  /** One per category, server order. */
  lines: TicketLine[];
  /** Category server order, then ordinal. */
  slots: TicketSlot[];
}

export type HolderType = 'self' | 'other';

export interface HolderEntry {
  slotKey: string;
  holderType: HolderType;
  fullName: string;
  /** Digits only; never logged. */
  nik: string;
}

export type ChangeQuantityResult =
  | { kind: 'changed'; quantities: TicketQuantities }
  | { kind: 'unchanged'; reason: 'LIMIT_REACHED' | 'NONE_TO_REMOVE' | 'UNKNOWN_CATEGORY' };

export type SetHolderTypeResult =
  | { kind: 'changed'; holders: HolderEntry[] }
  | { kind: 'unchanged'; reason: 'SELF_TAKEN' | 'NO_PROFILE_NAME' | 'SAME_TYPE' | 'UNKNOWN_SLOT' };

export interface OrderTicketSelectionUseCaseInterface {
  orderLimit: (input: OrderLimitInput) => number;
  summarize: (
    categories: readonly SelectableCategory[],
    quantities: TicketQuantities,
    limit: number,
  ) => TicketSelection;
  increment: (
    categories: readonly SelectableCategory[],
    quantities: TicketQuantities,
    categoryId: string,
    limit: number,
  ) => ChangeQuantityResult;
  decrement: (
    categories: readonly SelectableCategory[],
    quantities: TicketQuantities,
    categoryId: string,
  ) => ChangeQuantityResult;
  reconcileHolders: (holders: readonly HolderEntry[], slots: readonly TicketSlot[]) => HolderEntry[];
  canChooseSelf: (holders: readonly HolderEntry[], slotKey: string) => boolean;
  setHolderType: (
    holders: readonly HolderEntry[],
    slotKey: string,
    holderType: HolderType,
    profileName: string,
  ) => SetHolderTypeResult;
}

/** A whole number ≥ 0; anything else from the server is ignored (the hold re-checks it). */
const isValidCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** Negative, fractional or non-number quantities read as 0, so the rules never see a broken count. */
const quantityOf = (quantities: TicketQuantities, categoryId: string): number => {
  const value = quantities[categoryId];
  return isValidCount(value) ? value : 0;
};

const totalOf = (categories: readonly SelectableCategory[], quantities: TicketQuantities): number =>
  categories.reduce((sum, { categoryId }) => sum + quantityOf(quantities, categoryId), 0);

const isKnown = (categories: readonly SelectableCategory[], categoryId: string): boolean =>
  categories.some((category) => category.categoryId === categoryId);

const emptyEntry = (slotKey: string): HolderEntry => ({ slotKey, holderType: 'other', fullName: '', nik: '' });

/** No dependencies: pure order rules (FR-13, ADR-0004, ADR-0007). */
export const OrderTicketSelectionUseCase = (): OrderTicketSelectionUseCaseInterface => ({
  orderLimit: ({ maxTicketsPerOrder, reservedUnits }) =>
    Math.min(ORDER_MAX_TICKETS, ...[maxTicketsPerOrder, reservedUnits].filter(isValidCount)),

  summarize: (categories, quantities, limit) => {
    const total = totalOf(categories, quantities);
    const lines: TicketLine[] = [];
    const slots: TicketSlot[] = [];
    let index = 0;
    for (const { categoryId, name } of categories) {
      const quantity = quantityOf(quantities, categoryId);
      lines.push({ categoryId, quantity, canIncrement: total < limit, canDecrement: quantity > 0 });
      for (let ordinal = 1; ordinal <= quantity; ordinal += 1) {
        index += 1;
        slots.push({ key: `${categoryId}-${ordinal}`, categoryId, categoryName: name, ordinal, index });
      }
    }
    return { total, lines, slots };
  },

  increment: (categories, quantities, categoryId, limit) => {
    if (!isKnown(categories, categoryId)) return { kind: 'unchanged', reason: 'UNKNOWN_CATEGORY' };
    if (totalOf(categories, quantities) >= limit) return { kind: 'unchanged', reason: 'LIMIT_REACHED' };
    return {
      kind: 'changed',
      quantities: { ...quantities, [categoryId]: quantityOf(quantities, categoryId) + 1 },
    };
  },

  decrement: (categories, quantities, categoryId) => {
    if (!isKnown(categories, categoryId)) return { kind: 'unchanged', reason: 'UNKNOWN_CATEGORY' };
    const quantity = quantityOf(quantities, categoryId);
    if (quantity <= 0) return { kind: 'unchanged', reason: 'NONE_TO_REMOVE' };
    return { kind: 'changed', quantities: { ...quantities, [categoryId]: quantity - 1 } };
  },

  reconcileHolders: (holders, slots) => {
    const byKey = new Map(holders.map((holder) => [holder.slotKey, holder]));
    return slots.map((slot) => {
      const kept = byKey.get(slot.key);
      return kept ? { ...kept } : emptyEntry(slot.key);
    });
  },

  canChooseSelf: (holders, slotKey) =>
    !holders.some((holder) => holder.holderType === 'self' && holder.slotKey !== slotKey),

  setHolderType: (holders, slotKey, holderType, profileName) => {
    const target = holders.find((holder) => holder.slotKey === slotKey);
    if (!target) return { kind: 'unchanged', reason: 'UNKNOWN_SLOT' };
    if (target.holderType === holderType) return { kind: 'unchanged', reason: 'SAME_TYPE' };
    const name = profileName.trim();
    if (holderType === 'self') {
      if (name === '') return { kind: 'unchanged', reason: 'NO_PROFILE_NAME' };
      if (holders.some((holder) => holder.holderType === 'self' && holder.slotKey !== slotKey)) {
        return { kind: 'unchanged', reason: 'SELF_TAKEN' };
      }
    }
    return {
      kind: 'changed',
      holders: holders.map((holder) => {
        if (holder.slotKey !== slotKey) return holder;
        return holderType === 'self'
          ? { ...holder, holderType: 'self', fullName: name }
          : { ...holder, holderType: 'other', fullName: '' };
      }),
    };
  },
});
