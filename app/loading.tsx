export default function Loading() {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-brand">Brainrot Intel</div>
      <div className="spinner" aria-hidden="true" />
      <div className="loading-hint">Loading...</div>
    </div>
  );
}
