import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { Hero } from "../components/Hero";
import { CategoryRow } from "../components/CategoryRow";
import { ErrorState, SkeletonRow } from "../components/States";

/** Landing page: featured hero + category rows. */
export function HomePage() {
  const { data, loading, error } = useAsync((signal) => api.getHome(signal), []);

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: "62vh", minHeight: 420 }} />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="page">
      {data?.featured && <Hero item={data.featured} />}
      {data?.categories.map((row) => (
        <CategoryRow key={row.slug} row={row} />
      ))}
    </div>
  );
}
