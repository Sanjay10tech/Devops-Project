import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { ContentCard } from "../components/ContentCard";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/States";

/** Search results page driven by the ?q= query param. */
export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q")?.trim() ?? "";

  const { data, loading, error } = useAsync(
    (signal) => (q ? api.search(q, signal) : Promise.resolve([])),
    [q]
  );

  return (
    <div className="page">
      <div className="row">
        <h2 className="row__title">
          {q ? `Results for "${q}"` : "Search"}
        </h2>
      </div>

      {!q && <EmptyState message="Type a title in the search box above." />}
      {q && loading && <LoadingState label="Searching…" />}
      {q && error && <ErrorState message={error} />}
      {q && !loading && !error && data && data.length === 0 && (
        <EmptyState message={`No titles match "${q}".`} />
      )}

      {data && data.length > 0 && (
        <div className="grid">
          {data.map((item) => (
            <ContentCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
