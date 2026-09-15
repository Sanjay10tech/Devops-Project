import { useNavigate } from "react-router-dom";
import { Content } from "../types";

/** The large banner at the top of the home page for the featured title. */
export function Hero({ item }: { item: Content }) {
  const navigate = useNavigate();
  return (
    <section
      className="hero"
      style={{ backgroundImage: `url(${item.backdropUrl})` }}
      aria-label={`Featured: ${item.title}`}
    >
      <div className="hero__inner">
        <h1 className="hero__title">{item.title}</h1>
        <p className="hero__desc">{item.description}</p>
        <div className="hero__actions">
          <button
            className="btn btn--primary"
            onClick={() => navigate(`/title/${item.id}`)}
          >
            ▶ Play
          </button>
          <button
            className="btn btn--secondary"
            onClick={() => navigate(`/title/${item.id}`)}
          >
            More Info
          </button>
        </div>
      </div>
    </section>
  );
}
