import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { ErrorState, LoadingState } from "../components/States";

/** Details page for a single title. */
export function DetailsPage() {
  const { id = "" } = useParams();
  const { data, loading, error } = useAsync(
    (signal) => api.getById(id, signal),
    [id]
  );

  if (loading) return <div className="page"><LoadingState /></div>;
  if (error)
    return (
      <div className="page">
        <ErrorState message={error} />
        <div style={{ padding: "0 4vw" }}>
          <Link className="back-link" to="/">← Back to home</Link>
        </div>
      </div>
    );
  if (!data) return null;

  const runtime =
    data.type === "movie"
      ? `${data.durationMinutes ?? "?"} min`
      : `${data.seasons ?? "?"} season${(data.seasons ?? 0) > 1 ? "s" : ""}`;

  return (
    <div className="page">
      <div
        className="details__backdrop"
        style={{ backgroundImage: `url(${data.backdropUrl})` }}
      />
      <div className="details__body">
        <h1 className="details__title">{data.title}</h1>
        <div className="details__tags">
          <span className="tag">{data.releaseYear}</span>
          <span className="tag">{data.maturityRating}</span>
          <span className="tag">{runtime}</span>
          <span className="tag">★ {data.rating.toFixed(1)}</span>
          {data.genres.map((g) => (
            <span key={g} className="tag">{g}</span>
          ))}
        </div>
        <p>{data.description}</p>
        <Link className="back-link" to="/">← Back to home</Link>
      </div>
    </div>
  );
}
