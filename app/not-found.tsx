import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="empty-state p-4 text-center not-found-page">
      <div className="not-found-code">404</div>
      <div className="empty-state-title">Page Not Found</div>
      <div className="empty-state-sub">The page you&apos;re looking for doesn&apos;t exist.</div>
      <Link href="/" className="btn btn-primary mt-3">Back to Dashboard</Link>
    </div>
  );
}
