import { CategoryRow as CategoryRowType } from "../types";
import { ContentCard } from "./ContentCard";

/** A horizontal, scrollable row of content cards under a category title. */
export function CategoryRow({ row }: { row: CategoryRowType }) {
  if (row.items.length === 0) return null;
  return (
    <section className="row" aria-label={row.name}>
      <h2 className="row__title">{row.name}</h2>
      <div className="row__scroller">
        {row.items.map((item) => (
          <ContentCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
