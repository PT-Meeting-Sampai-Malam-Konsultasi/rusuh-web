import type { OrderCategoryView } from '@utils/format/order-event';

import styles from './category-list.module.css';

interface CategoryListProps {
  heading: string;
  note: string;
  categories: OrderCategoryView[];
}

/** Section 1: the categories in server order, name and what it means. Price, status and stepper come later. */
export default function CategoryList({ heading, note, categories }: CategoryListProps) {
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
          <li key={category.id} className={styles.row}>
            <div className={styles.name}>
              <h3 className={styles.title}>{category.name}</h3>
              {category.description && <p className={styles.description}>{category.description}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
