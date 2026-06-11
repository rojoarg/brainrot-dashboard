'use client';

import React, { useEffect, useState } from 'react';

interface BlacklistModalProps {
  onClose: () => void;
  showToast: (msg: string) => void;
  onChanged: () => void;       // refresh dashboard data after edits
  suggestions: string[];       // known brainrot names for the datalist
}

/**
 * Scrape blacklist manager — names added here are skipped by the scraper and
 * hidden from the entire app (unlike the config blacklist, which only keeps
 * pets out of generated configs).
 */
export default function BlacklistModal({ onClose, showToast, onChanged, suggestions }: BlacklistModalProps) {
  const [names, setNames] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/blacklist')
      .then(r => r.json())
      .then(j => { if (alive) { setNames(j.blacklisted || []); setLoaded(true); } })
      .catch(() => { if (alive) { showToast('Failed to load scrape blacklist'); setLoaded(true); } });
    return () => { alive = false; };
  }, [showToast]);

  // Esc closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const act = async (action: 'add' | 'remove', rawName: string) => {
    const name = rawName.trim();
    if (!name || busy) return;
    if (action === 'add' && names.some(n => n.toLowerCase() === name.toLowerCase())) {
      showToast(`"${name}" is already blacklisted`);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch('/api/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, name }),
      });
      const j = await r.json();
      if (r.ok && j.success) {
        setNames(j.blacklisted || []);
        showToast(action === 'add'
          ? `"${name}" blacklisted — hidden now${j.removedListings ? ` (${j.removedListings} listings removed)` : ''} and skipped in future scrapes`
          : `"${name}" removed from scrape blacklist (reappears after next scrape)`);
        onChanged();
      } else {
        showToast(j.error || 'Blacklist update failed');
      }
    } catch {
      showToast('Blacklist update failed');
    } finally {
      setBusy(false);
    }
  };

  const submitAdd = () => { act('add', input); setInput(''); };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)' }}
      onClick={onClose} role="dialog" aria-modal="true" aria-label="Scrape blacklist">
      <div className="glass-card animate-fade-in" style={{ width: 'min(500px, 92vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 20 }}
        onClick={e => e.stopPropagation()}>
        <div className="d-flex justify-between items-center mb-1">
          <h2 className="text-lg fw-700" style={{ color: 'var(--red)' }}>🚫 Scrape Blacklist</h2>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="text-xs text-muted mb-3" style={{ lineHeight: 1.5 }}>
          Brainrots here are <strong>skipped when scraping and hidden everywhere in the app</strong>.
          (Different from the Config tab blacklist, which only keeps pets out of generated configs.)
        </p>

        <div className="d-flex gap-2 mb-3">
          <input className="input flex-1" placeholder="Brainrot name…" value={input} list="bl-suggestions"
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitAdd(); }}
            disabled={busy} autoFocus />
          <datalist id="bl-suggestions">
            {suggestions.slice(0, 400).map(n => <option key={n} value={n} />)}
          </datalist>
          <button type="button" className="btn btn-primary" onClick={submitAdd} disabled={busy || !input.trim()}>
            {busy ? '…' : 'Add'}
          </button>
        </div>

        <div style={{ overflow: 'auto', flex: 1 }}>
          {!loaded ? (
            <div className="text-sm text-muted">Loading…</div>
          ) : names.length === 0 ? (
            <div className="text-sm text-muted">Nothing blacklisted — every brainrot on Eldorado gets scraped.</div>
          ) : (
            <div className="d-flex flex-wrap gap-1">
              {names.map(n => (
                <div key={n} className="blacklist-chip">
                  <span className="text-red">{n}</span>
                  <button type="button" onClick={() => act('remove', n)} disabled={busy} aria-label={`Remove ${n} from blacklist`}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {names.length > 0 && (
          <div className="text-xs text-muted mt-2">
            {names.length} blacklisted · removing one brings it back on the next scrape
          </div>
        )}
      </div>
    </div>
  );
}
