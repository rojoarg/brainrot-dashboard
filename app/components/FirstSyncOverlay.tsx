'use client';

import React, { useEffect, useState } from 'react';

/**
 * Full first-launch sync screen — shown instead of an empty dashboard while
 * the first scrape runs. Polls the scrape status directly for live progress.
 * A bootstrap swap puts the first ~2k (highest-value) listings live within
 * ~1 minute, at which point the dashboard takes over.
 */
export default function FirstSyncOverlay() {
  const [run, setRun] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const s = await fetch('/api/scrape?action=status').then(r => r.json());
        if (alive) setRun(s?.run || null);
      } catch { /* transient — keep last state */ }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const pages = run?.pages_scraped || 0;
  const staged = run?.staging_count || 0;
  // marketplace_total is only stamped at completion — use the known market
  // size as the progress denominator until then.
  const total = run?.marketplace_total > 0 ? run.marketplace_total : 54000;
  const pct = Math.min(99, Math.round((staged / Math.max(total, 1)) * 100));

  return (
    <div className="loading-screen" style={{ minHeight: '55vh' }} role="status" aria-live="polite">
      <div className="loading-brand">Brainrot Intel</div>
      <div className="spinner" aria-hidden="true" />
      <div className="loading-hint">First market sync — pulling live listings from Eldorado…</div>
      <div className="text-mono text-xl fw-700 mt-3" style={{ color: 'var(--accent2)' }}>
        {staged.toLocaleString()} listings
      </div>
      <div className="text-sm text-muted mt-1">{pages} pages scraped · ~{pct}% of the market</div>
      <div style={{ width: 'min(420px, 80vw)', height: 6, borderRadius: 3, background: 'var(--bg3)', marginTop: 12, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, var(--accent), var(--accent2))', transition: 'width 1s ease' }} />
      </div>
      <div className="text-xs text-muted mt-3" style={{ maxWidth: 420, textAlign: 'center' }}>
        A first preview appears in about a minute. The full market (~54k listings) takes
        ~15 minutes — you can start exploring as soon as the preview loads.
      </div>
    </div>
  );
}
