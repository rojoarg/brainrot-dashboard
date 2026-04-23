export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <div className="loading-screen" style={{ minHeight: 'auto', padding: '48px 0 16px' }}>
        <div className="loading-brand">Brainrot Intel</div>
        <div className="spinner" aria-hidden="true" />
        <div className="loading-hint">Initializing dashboard...</div>
      </div>
      {/* Skeleton layout */}
      <div className="dashboard-wrap" style={{ pointerEvents: 'none' }}>
        <div style={{ marginBottom: 24 }}>
          <div className="d-flex items-center gap-2 mb-2">
            <div className="skeleton" style={{ height: 32, width: 280, borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 20, width: 50, borderRadius: 4 }} />
          </div>
          <div className="d-flex gap-3">
            <div className="skeleton" style={{ height: 14, width: 100, borderRadius: 3 }} />
            <div className="skeleton" style={{ height: 14, width: 80, borderRadius: 3 }} />
            <div className="skeleton" style={{ height: 14, width: 70, borderRadius: 3 }} />
          </div>
        </div>
        <div className="skeleton" style={{ height: 48, width: '100%', borderRadius: 14, marginBottom: 24 }} />
        <div className="skeleton-grid-stats" style={{ marginBottom: 24 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-stat" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
        <div className="skeleton-grid-charts">
          <div className="skeleton skeleton-chart" />
          <div className="skeleton skeleton-chart" />
        </div>
      </div>
    </div>
  );
}
