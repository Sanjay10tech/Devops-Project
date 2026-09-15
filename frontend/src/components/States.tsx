interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

/** Full-panel loading spinner. */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

/** Full-panel error message with an optional retry action. */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="state" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn--secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Empty-results state. */
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="state">
      <p>{message}</p>
    </div>
  );
}

/** Skeleton row shown while a content row loads. */
export function SkeletonRow() {
  return (
    <div className="row">
      <div className="skeleton" style={{ height: 22, width: 180, marginBottom: 12 }} />
      <div className="row__scroller">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ aspectRatio: "2 / 3" }} />
        ))}
      </div>
    </div>
  );
}
