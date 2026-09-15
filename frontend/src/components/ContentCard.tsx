import { useNavigate } from "react-router-dom";
import { Content } from "../types";

/** A single poster card. Navigates to the details page on click/Enter. */
export function ContentCard({ item }: { item: Content }) {
  const navigate = useNavigate();
  const go = () => navigate(`/title/${item.id}`);

  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") go();
      }}
      aria-label={`${item.title} (${item.releaseYear})`}
    >
      <img
        className="card__img"
        src={item.thumbnailUrl}
        alt={item.title}
        loading="lazy"
      />
      <div className="card__meta">
        <p className="card__title">{item.title}</p>
        <span className="card__sub">
          {item.type === "movie" ? "Movie" : "Show"} · {item.releaseYear} · ★{" "}
          {item.rating.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
