'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error boundary caught:', error);
  }, [error]);

  return (
    <div
      role="alert"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        background: 'var(--bg, #0a0a0a)',
        color: 'var(--text, #e0e0e0)',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ color: 'var(--text3, #888)', marginBottom: 24, maxWidth: 500 }}>
        An unexpected error occurred while loading the dashboard.
        {error.digest && <span style={{ display: 'block', fontSize: 11, marginTop: 8, opacity: 0.5 }}>Reference: {error.digest}</span>}
      </p>
      <button
        onClick={reset}
        autoFocus
        style={{
          padding: '10px 24px',
          borderRadius: 8,
          border: 'none',
          background: 'var(--accent, #ef4444)',
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        Try again
      </button>
    </div>
  );
}
