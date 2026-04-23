'use client';

import React from 'react';
import { RARITY_COLORS, TIER_CLS } from '../lib/constants';

/* ─── Stat Card ─── */
export const StatCard = React.memo(function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
});

/* ─── Tier Badge ─── */
export const TierBadge = React.memo(function TierBadge({ tier }: { tier: string }) {
  return <span className={`badge tier-badge ${TIER_CLS[tier] || 'tier-D'}`}>{tier}</span>;
});

/* ─── Rarity Badge ─── */
export const RarityBadge = React.memo(function RarityBadge({ rarity }: { rarity: string }) {
  const c = RARITY_COLORS[rarity] || '#666';
  return <span className="badge badge-rarity" style={{ color: c, borderLeft: `2px solid ${c}` }}>{rarity}</span>;
});

/* ─── Watchlist Button ─── */
export const WLButton = React.memo(function WLButton({ name, isOnWL, onAdd, onRemove }: { name: string; isOnWL: boolean; onAdd: (n: string) => void; onRemove: (n: string) => void }) {
  return isOnWL
    ? <button type="button" className="btn btn-success btn-sm" onClick={(e) => { e.stopPropagation(); onRemove(name); }} aria-label={`Remove ${name} from watchlist`}>★ WL</button>
    : <button type="button" className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); onAdd(name); }} aria-label={`Add ${name} to watchlist`}>+ WL</button>;
});

/* ─── Image Thumbnail ─── */
const ALLOWED_IMAGE_HOSTS = ['eldorado.gg', 'cdn.eldorado.gg', 'assets.eldorado.gg', 'img.eldorado.gg'];
function isValidImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch { return false; }
}
export const ImageThumb = React.memo(function ImageThumb({ src, size = 28, alt = '' }: { src?: string; size?: number; alt?: string }) {
  if (!src || !isValidImageUrl(src)) return <div className="img-placeholder" style={{ width: size, height: size }} role="img" aria-label={alt || 'No image'} />;
  return <img src={src} width={size} height={size} className="img-thumb" alt={alt} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />;
});

/* ─── Trust Badge ─── */
export const TrustBadge = React.memo(function TrustBadge({ score }: { score: number }) {
  const s = isFinite(score) ? score : 0;
  const c = s >= 85 ? 'var(--green)' : s >= 60 ? 'var(--gold)' : 'var(--red)';
  return <span className="trust-score" style={{ color: c }}>{s}%</span>;
});

/* ─── Search Input ─── */
export const SearchInput = React.memo(function SearchInput({ value, onChange, placeholder = 'Search...', maxWidth = 240 }: { value: string; onChange: (v: string) => void; placeholder?: string; maxWidth?: number }) {
  return (
    <div className="search-input-wrap" style={{ maxWidth }}>
      <span className="search-icon">{'\uD83D\uDD0D'}</span>
      <input type="text" className="input search-input" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} aria-label={placeholder} autoComplete="off" />
      {value && <button type="button" className="search-clear" onClick={() => onChange('')} aria-label="Clear search">{'\u2715'}</button>}
    </div>
  );
});

/* ─── Filter Bar ─── */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="filter-bar">{children}</div>;
}

/* ─── Sparkline ─── */
export const Sparkline = React.memo(function Sparkline({ data: d, color = 'var(--accent)', width = 60, height = 20 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (!d || d.length < 2) return null;
  const min = Math.min(...d);
  const max = Math.max(...d);
  const range = max - min || 1;
  const points = d.map((v, i) => `${(i / (d.length - 1)) * width},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
});

/* ─── Empty State ─── */
export const EmptyState = React.memo(function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-title">{message}</div>
      {sub && <div className="empty-state-sub">{sub}</div>}
    </div>
  );
});
