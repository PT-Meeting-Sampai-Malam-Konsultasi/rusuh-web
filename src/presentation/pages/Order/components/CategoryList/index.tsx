import type { OrderCategoryRow, OrderLimitNotice } from '@controllers/order.controller';

import styles from './category-list.module.css';

interface CategoryListProps {
  heading: string;
  note: string;
  categories: OrderCategoryRow[];
  onIncrement: (categoryId: string) => void;
  onDecrement: (categoryId: string) => void;
  /** Non-null when the order limit is reached: "3/3" + message. */
  limitNotice: OrderLimitNotice | null;
}

/**
 * Section 1: the categories in server order with name, availability label, price and the − / count / + stepper.
 * DOM order name → status → price → stepper, so a sold-out row reads "Habis" before its price; the strike-through is
 * CSS only. The count span is keyed by the quantity so it remounts and replays the bump; the `output` stays mounted.
 * The limit region stays mounted (empty when `limitNotice` is null) so the line is announced when it is inserted.
 */
export default function CategoryList({
  heading,
  note,
  categories,
  onIncrement,
  onDecrement,
  limitNotice,
}: CategoryListProps) {
  return (
    <section className={styles.section} aria-labelledby="order-categories-heading">
      <div className={styles.head}>
        <h2 className={styles.heading} id="order-categories-heading">
          <span className={styles.badge} aria-hidden="true">
            1
          </span>
          {heading}
        </h2>
        {note && (
          <p className={styles.note} id="order-categories-note">
            {note}
          </p>
        )}
      </div>
      <ul className={styles.list} aria-describedby={note ? 'order-categories-note' : undefined}>
        {categories.map((category) => (
          <li
            key={category.id}
            className={styles.row}
            data-sold-out={category.soldOut || undefined}
            data-selected={category.selected || undefined}
          >
            <div className={styles.name}>
              <h3 className={styles.title}>{category.name}</h3>
              {category.description && <p className={styles.description}>{category.description}</p>}
            </div>
            {category.availabilityLabel && (
              <span className={styles.status} data-availability={category.availability ?? undefined}>
                {category.availabilityLabel}
              </span>
            )}
            <span className={styles.price}>{category.price}</span>
            <div className={styles.stepper}>
              <button
                type="button"
                className={styles.stepButton}
                aria-label={category.decrementLabel}
                disabled={!category.canDecrement}
                onClick={() => onDecrement(category.id)}
              >
                −
              </button>
              <output className={styles.count} aria-live="polite">
                <span key={category.quantity} className={styles.countValue}>
                  {category.quantity}
                </span>
              </output>
              <button
                type="button"
                className={styles.stepButton}
                aria-label={category.incrementLabel}
                disabled={!category.canIncrement}
                onClick={() => onIncrement(category.id)}
              >
                +
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div role="status" aria-atomic="true">
        {limitNotice && (
          <p className={styles.limit}>
            <b className={styles.limitCount}>{limitNotice.count}</b> <span>{limitNotice.message}</span>
          </p>
        )}
      </div>
    </section>
  );
}
